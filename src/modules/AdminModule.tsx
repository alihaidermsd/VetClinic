import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Users,
  Plus,
  Settings,
  UserPlus,
  Trash2,
  Edit,
  Database,
  Download,
  Upload,
  ShieldOff,
  RotateCcw,
} from 'lucide-react';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getActiveAdminUserCount,
  type UserUpdateInput,
} from '@/lib/services/userService';
import { getAllRooms, createRoom, deleteRoom } from '@/lib/services/roomService';
import { exportDatabase, importDatabase, resetDatabase } from '@/lib/database';
import type { User, UserRole, RoomType } from '@/types';
import { toast } from 'sonner';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'reception', label: 'Receptionist' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'lab_operator', label: 'Lab Operator' },
  { value: 'xray_operator', label: 'X-Ray Operator' },
  { value: 'surgery_operator', label: 'Surgery Operator' },
  { value: 'pharmacy', label: 'Pharmacist' },
  { value: 'accountant', label: 'Accountant' },
];

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'reception', label: 'Reception' },
  { value: 'doctor_room', label: 'Doctor Room' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'xray', label: 'X-Ray Room' },
  { value: 'surgery', label: 'Surgery Room' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

const ROOM_NONE = '__none__';

function roomLabel(rooms: { id: number; name: string }[], roomId?: number | null): string {
  if (roomId == null || !Number.isFinite(Number(roomId))) return '—';
  return rooms.find((r) => r.id === roomId)?.name ?? `Room #${roomId}`;
}

function validateUserMutation(
  target: User,
  actorId: number,
  next: { role: UserRole; isActive: boolean }
): string | null {
  const adminCount = getActiveAdminUserCount();
  const targetIsActiveAdmin = target.role === 'admin' && target.is_active;
  const onlyActiveAdmin = targetIsActiveAdmin && adminCount <= 1;

  if (target.id === actorId) {
    if (!next.isActive) {
      return 'You cannot deactivate your own account while signed in.';
    }
    if (next.role !== 'admin') {
      return 'You cannot remove your own administrator role.';
    }
  }

  if (onlyActiveAdmin) {
    if (!next.isActive) {
      return 'Cannot deactivate the only active administrator.';
    }
    if (next.role !== 'admin') {
      return 'Cannot change the role of the only active administrator.';
    }
  }

  return null;
}

export function AdminModule() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [addForm, setAddForm] = useState({
    username: '',
    password: '',
    name: '',
    role: 'reception' as UserRole,
    room_id: ROOM_NONE,
  });

  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    role: 'reception' as UserRole,
    room_id: ROOM_NONE,
    newPassword: '',
    is_active: true,
  });

  const [roomForm, setRoomForm] = useState({
    name: '',
    type: 'doctor_room' as RoomType,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setUsers(getAllUsers() as User[]);
    setRooms(getAllRooms());
  };

  const handleAddUser = () => {
    try {
      const roomId =
        addForm.room_id === ROOM_NONE ? null : parseInt(addForm.room_id, 10);
      createUser({
        username: addForm.username,
        password: addForm.password,
        name: addForm.name,
        role: addForm.role,
        room_id: roomId,
        is_active: true,
      });
      toast.success('User created');
      setShowAddUser(false);
      setAddForm({
        username: '',
        password: '',
        name: '',
        role: 'reception',
        room_id: ROOM_NONE,
      });
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create user';
      toast.error(msg);
    }
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setEditForm({
      username: u.username,
      name: u.name,
      role: u.role,
      room_id: u.room_id != null && u.room_id > 0 ? String(u.room_id) : ROOM_NONE,
      newPassword: '',
      is_active: Boolean(u.is_active),
    });
  };

  const handleUpdateUser = () => {
    if (!editingUser || !currentUser) return;

    const err = validateUserMutation(editingUser, currentUser.id, {
      role: editForm.role,
      isActive: editForm.is_active,
    });
    if (err) {
      toast.error(err);
      return;
    }

    try {
      const roomId =
        editForm.room_id === ROOM_NONE ? null : parseInt(editForm.room_id, 10);
      const payload: UserUpdateInput = {
        username: editForm.username,
        name: editForm.name,
        role: editForm.role,
        room_id: roomId,
        is_active: editForm.is_active,
      };
      const np = editForm.newPassword.trim();
      if (np.length > 0) {
        payload.password = np;
      }
      updateUser(editingUser.id, payload);
      toast.success('User updated');
      setEditingUser(null);
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update user';
      toast.error(msg);
    }
  };

  const handleDeactivateUser = (target: User) => {
    if (!currentUser) return;
    if (!window.confirm(`Deactivate ${target.name}? They will not be able to sign in.`)) return;

    const err = validateUserMutation(target, currentUser.id, {
      role: target.role,
      isActive: false,
    });
    if (err) {
      toast.error(err);
      return;
    }

    try {
      deleteUser(target.id);
      toast.success('User deactivated');
      if (editingUser?.id === target.id) setEditingUser(null);
      loadData();
    } catch {
      toast.error('Failed to deactivate user');
    }
  };

  const handleRestoreUser = (target: User) => {
    try {
      updateUser(target.id, { is_active: true });
      toast.success('User reactivated');
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reactivate user';
      toast.error(msg);
    }
  };

  const handleAddRoom = () => {
    try {
      createRoom(roomForm.name, roomForm.type);
      toast.success('Room created successfully');
      setShowAddRoom(false);
      setRoomForm({ name: '', type: 'doctor_room' });
      loadData();
    } catch {
      toast.error('Failed to create room');
    }
  };

  const handleDeleteRoom = (roomId: number) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;

    try {
      deleteRoom(roomId);
      toast.success('Room deleted');
      loadData();
    } catch {
      toast.error('Failed to delete room');
    }
  };

  const handleExportData = () => {
    try {
      const data = exportDatabase();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `animal_care_hospital_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('Database exported successfully');
    } catch {
      toast.error('Failed to export database');
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result as string;
        importDatabase(data);
        toast.success('Database imported successfully');
        loadData();
      } catch {
        toast.error('Failed to import database');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (currentUser?.role !== 'admin') {
    return (
      <Card className="max-w-lg border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <ShieldOff className="w-5 h-5" />
            Restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-900">
          User management and system administration are visible only to accounts with the administrator role.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Manage users
              </CardTitle>
              <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                <DialogTrigger asChild>
                  <Button type="button">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add user
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add user</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="add-name">Full name</Label>
                      <Input
                        id="add-name"
                        value={addForm.name}
                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                        placeholder="Full name"
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-user">Username</Label>
                      <Input
                        id="add-user"
                        value={addForm.username}
                        onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                        placeholder="Unique login name"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-pass">Password</Label>
                      <Input
                        id="add-pass"
                        type="password"
                        value={addForm.password}
                        onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                        placeholder="At least 4 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={addForm.role}
                        onValueChange={(v: UserRole) => setAddForm({ ...addForm, role: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assigned room (optional)</Label>
                      <Select
                        value={addForm.room_id}
                        onValueChange={(v) => setAddForm({ ...addForm, room_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No room" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ROOM_NONE}>No room</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={String(room.id)}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" onClick={handleAddUser} className="w-full">
                      Create user
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Name</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Username</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Role</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Room</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Status</th>
                      <th className="text-right py-3 px-3 font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-3 font-medium text-slate-900">{row.name}</td>
                        <td className="py-3 px-3 text-slate-600">{row.username}</td>
                        <td className="py-3 px-3">
                          <Badge variant="outline">{row.role}</Badge>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{roomLabel(rooms, row.room_id)}</td>
                        <td className="py-3 px-3">
                          {row.is_active ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">Inactive</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEditUser(row)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {row.is_active ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDeactivateUser(row)}
                                aria-label={`Deactivate ${row.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRestoreUser(row)}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Restore
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
            </DialogHeader>
            {editingUser && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-user">Username</Label>
                  <Input
                    id="edit-user"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-pass">New password (optional)</Label>
                  <Input
                    id="edit-pass"
                    type="password"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                    placeholder="Leave blank to keep current password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(v: UserRole) => setEditForm({ ...editForm, role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned room</Label>
                  <Select
                    value={editForm.room_id}
                    onValueChange={(v) => setEditForm({ ...editForm, room_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No room" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ROOM_NONE}>No room</SelectItem>
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={String(room.id)}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="active-switch">Account active</Label>
                    <p className="text-xs text-slate-500">Inactive users cannot sign in</p>
                  </div>
                  <Switch
                    id="active-switch"
                    checked={editForm.is_active}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                  />
                </div>
                <Button type="button" onClick={handleUpdateUser} className="w-full">
                  Save changes
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <TabsContent value="rooms" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Manage Rooms
              </CardTitle>
              <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
                <DialogTrigger asChild>
                  <Button type="button">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Room
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Room</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Room Name</Label>
                      <Input
                        value={roomForm.name}
                        onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                        placeholder="Enter room name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Room Type</Label>
                      <Select
                        value={roomForm.type}
                        onValueChange={(v: RoomType) => setRoomForm({ ...roomForm, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" onClick={handleAddRoom} className="w-full">
                      Create Room
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Name</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Type</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <tr key={room.id} className="border-b border-slate-100">
                        <td className="py-3">{room.name}</td>
                        <td className="py-3">
                          <Badge variant="outline">{room.type}</Badge>
                        </td>
                        <td className="py-3">
                          {room.is_active ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">Inactive</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteRoom(room.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Backup & Restore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Download className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Export Database</h4>
                        <p className="text-sm text-slate-500">Download a backup of all data</p>
                      </div>
                    </div>
                    <Button type="button" onClick={handleExportData} className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Export Backup
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Upload className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Import Database</h4>
                        <p className="text-sm text-slate-500">Restore from a backup file</p>
                      </div>
                    </div>
                    <Input type="file" accept=".json,application/json" onChange={handleImportData} className="w-full" />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-red-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                      <Trash2 className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-red-600">Reset Database</h4>
                      <p className="text-sm text-slate-500">Clear all data and start fresh</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      if (window.confirm('Are you sure? This will delete ALL data!')) {
                        resetDatabase();
                        toast.success('Database reset');
                        loadData();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Reset Database
                  </Button>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
