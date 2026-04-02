import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  Plus, 
  Settings,
  UserPlus,
  Trash2,
  Edit,
  Database,
  Download,
  Upload
} from 'lucide-react';
import { getAllUsers, createUser, updateUser, deleteUser } from '@/lib/services/userService';
import { getAllRooms, createRoom, deleteRoom } from '@/lib/services/roomService';
import { exportDatabase, importDatabase, resetDatabase } from '@/lib/database';
import type { UserRole, RoomType } from '@/types';
import { toast } from 'sonner';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'reception', label: 'Receptionist' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'lab_operator', label: 'Lab Operator' },
  { value: 'xray_operator', label: 'X-Ray Operator' },
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

export function AdminModule() {
  const [users, setUsers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // User form
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    name: '',
    role: 'reception' as UserRole,
    room_id: '',
  });

  // Room form
  const [roomForm, setRoomForm] = useState({
    name: '',
    type: 'doctor_room' as RoomType,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setUsers(getAllUsers());
    setRooms(getAllRooms());
  };

  const handleAddUser = () => {
    try {
      createUser({
        ...userForm,
        room_id: userForm.room_id ? parseInt(userForm.room_id) : undefined,
        is_active: true,
      });
      toast.success('User created successfully');
      setShowAddUser(false);
      setUserForm({
        username: '',
        password: '',
        name: '',
        role: 'reception',
        room_id: '',
      });
      loadData();
    } catch (error) {
      toast.error('Failed to create user');
    }
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;

    try {
      updateUser(editingUser.id, {
        name: userForm.name,
        role: userForm.role,
        room_id: userForm.room_id ? parseInt(userForm.room_id) : undefined,
      });
      toast.success('User updated successfully');
      setEditingUser(null);
      loadData();
    } catch (error) {
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      deleteUser(userId);
      toast.success('User deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const handleAddRoom = () => {
    try {
      createRoom(roomForm.name, roomForm.type);
      toast.success('Room created successfully');
      setShowAddRoom(false);
      setRoomForm({ name: '', type: 'doctor_room' });
      loadData();
    } catch (error) {
      toast.error('Failed to create room');
    }
  };

  const handleDeleteRoom = (roomId: number) => {
    if (!confirm('Are you sure you want to delete this room?')) return;

    try {
      deleteRoom(roomId);
      toast.success('Room deleted');
      loadData();
    } catch (error) {
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
      a.download = `vetclinic_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('Database exported successfully');
    } catch (error) {
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
      } catch (error) {
        toast.error('Failed to import database');
      }
    };
    reader.readAsText(file);
  };

  const openEditUser = (user: any) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: '',
      name: user.name,
      role: user.role,
      room_id: user.room_id?.toString() || '',
    });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Manage Users
              </CardTitle>
              <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input
                        value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                        placeholder="Enter full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                        placeholder="Enter username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder="Enter password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select 
                        value={userForm.role} 
                        onValueChange={(v: UserRole) => setUserForm({ ...userForm, role: v })}
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
                      <Label>Assigned Room (Optional)</Label>
                      <Select 
                        value={userForm.room_id} 
                        onValueChange={(v) => setUserForm({ ...userForm, room_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                        <SelectContent>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id.toString()}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAddUser} className="w-full">
                      Create User
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
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Username</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Role</th>
                      <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                      <th className="text-right py-2 text-sm font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100">
                        <td className="py-3">{user.name}</td>
                        <td className="py-3 text-sm text-slate-500">{user.username}</td>
                        <td className="py-3">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="py-3">
                          {user.is_active ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">Inactive</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Dialog open={editingUser?.id === user.id} onOpenChange={() => setEditingUser(null)}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => openEditUser(user)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit User</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input
                                      value={userForm.name}
                                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select 
                                      value={userForm.role} 
                                      onValueChange={(v: UserRole) => setUserForm({ ...userForm, role: v })}
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
                                  <Button onClick={handleUpdateUser} className="w-full">
                                    Update User
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
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

        {/* Rooms Tab */}
        <TabsContent value="rooms" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Manage Rooms
              </CardTitle>
              <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
                <DialogTrigger asChild>
                  <Button>
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
                    <Button onClick={handleAddRoom} className="w-full">
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

        {/* Backup Tab */}
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
                    <Button onClick={handleExportData} className="w-full">
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
                    <Input
                      type="file"
                      accept=".db"
                      onChange={handleImportData}
                      className="w-full"
                    />
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
                    variant="destructive" 
                    className="w-full"
                    onClick={() => {
                      if (confirm('Are you sure? This will delete ALL data!')) {
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
