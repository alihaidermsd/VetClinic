import { useState, useEffect, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Plus,
  User,
  PawPrint,
  RefreshCw,
  ListOrdered,
  X,
  Percent,
  ClipboardList,
  ImagePlus,
  ArrowRight,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import {
  getTokenByNumber,
  getTokenWithDetails,
  startToken,
  getTokenById,
  getWaitingTokensByRoomType,
  getTodayActiveQueueItems,
  activateReferralAtRoom,
  hasPendingReferralToRoom,
  completeOperatorRoomVisit,
  referPatientToRooms,
  isDirectEntryToken,
  assignTokenToRoom,
} from '@/lib/services/tokenService';
import {
  getBillWithDetails,
  addBillItem,
  applyDiscount,
  getQuickChargePresets,
  updateBillItem,
  removeBillItem,
} from '@/lib/services/billingService';
import { QuickChargeSection } from '@/components/billing/QuickChargeSection';
import {
  getMedicalRecordsByBillId,
  parseImageJsonArray,
  upsertMedicalRecordFields,
} from '@/lib/services/medicalService';
import { getAllRooms } from '@/lib/services/roomService';
import { useAuth } from '@/hooks/useAuth';
import type { BillItemFormData, Room, RoomType, Token, ItemType, RoomQueueItem } from '@/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

type OperatorRoomKind = Extract<RoomType, 'lab' | 'xray' | 'surgery'>;

const SECTION_LABEL: Record<OperatorRoomKind, string> = {
  lab: 'Laboratory',
  xray: 'X-Ray Room',
  surgery: 'Surgery Room',
};

const DEFAULT_ITEM_TYPE: Record<OperatorRoomKind, ItemType> = {
  lab: 'lab_test',
  xray: 'xray',
  surgery: 'surgery',
};

/** Destinations an operator can send a patient to (same as doctor referrals; excludes current room). */
const OPERATOR_REFERRAL_ROOMS: { value: RoomType; label: string }[] = [
  { value: 'lab', label: 'Laboratory' },
  { value: 'xray', label: 'X-Ray Room' },
  { value: 'surgery', label: 'Surgery Room' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

function resolveOperatorBillRoom(
  rooms: Room[],
  assignedRoomId: number | null | undefined,
  roomType: OperatorRoomKind
): { roomId: number; roomName: string } {
  const id = assignedRoomId != null ? Number(assignedRoomId) : 0;
  if (id > 0) {
    const match = rooms.find((r) => Number(r.id) === id);
    if (match && match.type === roomType) {
      return { roomId: match.id, roomName: String(match.name || SECTION_LABEL[roomType]) };
    }
  }
  const first = rooms.find((r) => r.type === roomType);
  return {
    roomId: first?.id ?? 0,
    roomName: String(first?.name || SECTION_LABEL[roomType]),
  };
}

type RoomOperatorModuleProps = {
  roomType: OperatorRoomKind;
};

export function RoomOperatorModule({ roomType }: RoomOperatorModuleProps) {
  const { user } = useAuth();
  const sectionTitle = SECTION_LABEL[roomType];
  const defaultItemType = DEFAULT_ITEM_TYPE[roomType];

  const [tokenNumber, setTokenNumber] = useState('');
  const [currentToken, setCurrentToken] = useState<any>(null);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [roomQueue, setRoomQueue] = useState<RoomQueueItem[]>([]);
  const [allActiveQueue, setAllActiveQueue] = useState<RoomQueueItem[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'all' | 'refer'>('queue');
  const [referralTargets, setReferralTargets] = useState<Set<string>>(() => new Set());
  const [rooms, setRooms] = useState<Room[]>(() => getAllRooms());

  const operatorReferralOptions = OPERATOR_REFERRAL_ROOMS.filter((r) => r.value !== roomType);

  const [billDiscountPercent, setBillDiscountPercent] = useState('');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [operatorImages, setOperatorImages] = useState<string[]>([]);

  // Bill item CRUD (creator-only): operator can edit/delete their own lines.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemQty, setEditItemQty] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');

  useEffect(() => {
    setRooms(getAllRooms());
  }, []);

  const refreshRoomQueue = () => {
    try {
      setRoomQueue(getWaitingTokensByRoomType(roomType));
      setAllActiveQueue(getTodayActiveQueueItems());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshRoomQueue();
    const t = setInterval(refreshRoomQueue, 15000);
    return () => clearInterval(t);
  }, [roomType]);

  useEffect(() => {
    setReferralTargets(new Set());
  }, [currentToken?.token?.id]);

  useEffect(() => {
    const b = currentBill?.bill;
    if (!b?.id) {
      setBillDiscountPercent('');
      return;
    }
    const p = Number(b.discount_percent);
    setBillDiscountPercent(Number.isFinite(p) && p > 0 ? String(p) : '');
  }, [currentBill?.bill?.id]);

  useEffect(() => {
    const bid = currentBill?.bill?.id;
    if (!bid) {
      setOperatorNotes('');
      return;
    }
    const recs = getMedicalRecordsByBillId(bid);
    const latest = recs[0];
    if (!latest) {
      setOperatorNotes('');
      return;
    }
    if (roomType === 'lab') setOperatorNotes(latest.laboratory_notes ?? '');
    else if (roomType === 'xray') setOperatorNotes(latest.xray_notes ?? '');
    else setOperatorNotes(latest.surgery_notes ?? '');
  }, [currentBill?.bill?.id, roomType]);

  useEffect(() => {
    const bid = currentBill?.bill?.id;
    if (!bid || (roomType !== 'lab' && roomType !== 'xray')) {
      setOperatorImages([]);
      return;
    }
    const recs = getMedicalRecordsByBillId(bid);
    const latest = recs[0];
    if (!latest) {
      setOperatorImages([]);
      return;
    }
    if (roomType === 'lab') setOperatorImages(parseImageJsonArray(latest.laboratory_images));
    else setOperatorImages(parseImageJsonArray(latest.xray_images));
  }, [currentBill?.bill?.id, roomType]);

  const statusBadgeClass = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-amber-100 text-amber-900 border-amber-200',
      in_progress: 'bg-secondary text-primary border-primary/25',
      completed: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      cancelled: 'bg-red-100 text-red-900 border-red-200',
    };
    return styles[status] || 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const visitLocked =
    currentToken?.token?.status === 'completed' || currentToken?.token?.status === 'cancelled';

  const canModifyBillItem = (item: any): boolean => {
    if (!user) return false;
    if (visitLocked) return false;
    if (user.role === 'admin') return true;
    const sameId = Number(item?.operator_id) === Number(user.id);
    const sameName =
      String(item?.operator_name ?? '').trim().toLowerCase() ===
      String(user?.name ?? '').trim().toLowerCase();
    return sameId || sameName;
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemName('');
    setEditItemQty('');
    setEditItemPrice('');
  };

  const startEditItem = (item: any) => {
    const itemId = Number(item?.id);
    if (!Number.isFinite(itemId)) return;

    const unit =
      item?.unit_price != null
        ? Number(item.unit_price)
        : Number(item?.quantity) > 0
          ? Number(item?.total_price) / Number(item?.quantity)
          : 0;

    setEditingItemId(itemId);
    setEditItemName(String(item?.item_name ?? ''));
    setEditItemQty(String(Number(item?.quantity ?? 1) || 1));
    setEditItemPrice(String(Number(unit) || 0));
  };

  const handleSaveItemEdit = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    const item = currentBill?.items?.find((i: any) => Number(i?.id) === Number(itemId));
    if (!item) {
      toast.error('Line item not found');
      return;
    }
    if (!canModifyBillItem(item)) {
      toast.error('You can edit only the lines you created');
      return;
    }
    if (visitLocked) return;

    const name = editItemName.trim();
    const qty = parseInt(editItemQty, 10);
    const unitPrice = parseFloat(String(editItemPrice).replace(/,/g, ''));

    if (!name) {
      toast.error('Item name is required');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error('Unit price must be greater than 0');
      return;
    }

    try {
      updateBillItem(itemId, {
        item_name: name,
        quantity: qty,
        unit_price: unitPrice,
      });

      const refreshed = getBillWithDetails(currentBill.bill.id);
      if (refreshed) setCurrentBill(refreshed);
      cancelEditItem();
      toast.success('Line item updated');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update line item');
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (!currentBill?.bill?.id) return;
    const item = currentBill?.items?.find((i: any) => Number(i?.id) === Number(itemId));
    if (!item) {
      toast.error('Line item not found');
      return;
    }
    if (!canModifyBillItem(item)) {
      toast.error('You can delete only the lines you created');
      return;
    }
    if (visitLocked) return;

    const ok = window.confirm('Delete this line item?');
    if (!ok) return;

    try {
      const removed = removeBillItem(itemId);
      if (!removed) {
        toast.error('Failed to delete line item');
        return;
      }

      if (editingItemId === itemId) cancelEditItem();
      const refreshed = getBillWithDetails(currentBill.bill.id);
      if (refreshed) setCurrentBill(refreshed);
      toast.success('Line item deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete line item');
    }
  };

  const loadVisitForToken = (token: Token, options?: { silent?: boolean }): boolean => {
    if (token.status === 'cancelled') {
      toast.error('This token is cancelled');
      return false;
    }

    const { roomId: opRoomId } = resolveOperatorBillRoom(rooms, user?.room_id, roomType);
    if (!opRoomId) {
      toast.error(`No ${sectionTitle} is configured. Add it under Admin → Rooms.`);
      return false;
    }

    let working = token;

    if (token.status !== 'completed') {
      if (hasPendingReferralToRoom(token.id, opRoomId) && Number(token.room_id) !== opRoomId) {
        activateReferralAtRoom(token.id, opRoomId);
        const re = getTokenById(token.id);
        if (!re) {
          toast.error('Token no longer available');
          return false;
        }
        working = re;
      } else if (Number(working.room_id) !== opRoomId) {
        assignTokenToRoom(working.id, opRoomId);
        const re = getTokenById(working.id);
        if (!re) {
          toast.error('Token no longer available');
          return false;
        }
        working = re;
      }
    }

    const tokenDetails = getTokenWithDetails(working.id);
    if (!tokenDetails) {
      toast.error('Failed to load token details');
      return false;
    }

    const billDetails = getBillWithDetails(working.bill_id);
    if (!billDetails) {
      toast.error('Bill not found for this token');
      return false;
    }

    setCurrentToken(tokenDetails);
    setCurrentBill(billDetails);

    if (working.status === 'waiting') {
      startToken(working.id);
      const refreshedBill = getBillWithDetails(working.bill_id) || billDetails;
      setCurrentBill(refreshedBill);
      const refreshedToken = getTokenWithDetails(working.id);
      if (refreshedToken) setCurrentToken(refreshedToken);
    }

    refreshRoomQueue();
    if (!options?.silent) {
      const n = working.token_number;
      if (working.status === 'completed') {
        toast.success(`Token #${n} loaded (completed — view only)`);
      } else {
        toast.success(`Token #${n} loaded`);
      }
    }
    return true;
  };

  const handleSearchToken = () => {
    const raw = tokenNumber.trim().replace(/^#+/, '').trim();
    if (!raw) {
      toast.error('Please enter a token number');
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error('Enter a valid token number');
      return;
    }

    const token = getTokenByNumber(n);
    if (!token) {
      toast.error(`No token #${n} for today. Check the number or pick from the list on the right.`);
      refreshRoomQueue();
      return;
    }

    loadVisitForToken(token);
  };

  const openQueueRow = (row: RoomQueueItem) => {
    const token = getTokenById(row.token_id);
    if (!token) {
      toast.error('Token no longer available');
      refreshRoomQueue();
      return;
    }
    loadVisitForToken(token);
  };

  const clearCurrentPatient = () => {
    setCurrentToken(null);
    setCurrentBill(null);
    setTokenNumber('');
    refreshRoomQueue();
  };

  const handleAddBillLine = (itemData: BillItemFormData) => {
    if (!currentToken || !currentBill || !user) return;
    if (visitLocked) {
      toast.error('This visit is completed or cancelled — charges cannot be edited.');
      return;
    }

    const { roomId, roomName } = resolveOperatorBillRoom(rooms, user.room_id, roomType);
    if (!roomId) {
      toast.error(`No ${sectionTitle} is configured. Add it under Admin → Rooms.`);
      return;
    }

    if (!itemData.item_name?.trim()) {
      toast.error('Please enter item name');
      return;
    }
    const unit = parseFloat(String(itemData.unit_price).replace(/,/g, ''));
    if (!Number.isFinite(unit) || unit <= 0) {
      toast.error('Enter a valid unit price greater than zero');
      return;
    }
    const qty = parseInt(String(itemData.quantity), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Enter a valid quantity (at least 1)');
      return;
    }

    const payload: BillItemFormData = {
      item_name: itemData.item_name.trim(),
      item_type: itemData.item_type,
      quantity: qty,
      unit_price: unit,
      notes: itemData.notes ?? '',
    };

    try {
      addBillItem(currentBill.bill.id, payload, roomId, roomName, user.id, user.name);

      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      if (updatedBill && currentToken?.token?.id) {
        setCurrentToken(getTokenWithDetails(currentToken.token.id));
      }

      toast.success('Charge added successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add charge');
      console.error(error);
    }
  };

  const removeOperatorImageAt = (index: number) => {
    setOperatorImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOperatorImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const maxImages = 5;
    const maxBytes = 2 * 1024 * 1024;
    const next: string[] = [...operatorImages];
    for (const file of Array.from(files)) {
      if (next.length >= maxImages) {
        toast.error(`Maximum ${maxImages} images per visit`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name} is too large (max 2 MB each)`);
        continue;
      }
      try {
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.onerror = () => rej();
          r.readAsDataURL(file);
        });
        if (dataUrl) next.push(dataUrl);
      } catch {
        toast.error('Could not read image');
      }
    }
    setOperatorImages(next);
    e.target.value = '';
  };

  const handleApplyBillDiscount = () => {
    if (!currentBill?.bill?.id || visitLocked) return;
    const pct = parseFloat(billDiscountPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('Enter a discount between 0 and 100');
      return;
    }
    try {
      applyDiscount(currentBill.bill.id, pct);
      const updated = getBillWithDetails(currentBill.bill.id);
      if (updated) setCurrentBill(updated);
      toast.success(pct === 0 ? 'Discount removed' : 'Discount updated');
      setBillDiscountPercent(pct === 0 ? '' : String(pct));
    } catch {
      toast.error('Could not update discount');
    }
  };

  const handleRemoveBillDiscount = () => {
    if (!currentBill?.bill?.id || visitLocked) return;
    try {
      applyDiscount(currentBill.bill.id, 0);
      const updated = getBillWithDetails(currentBill.bill.id);
      if (updated) setCurrentBill(updated);
      setBillDiscountPercent('');
      toast.success('Discount removed');
    } catch {
      toast.error('Could not remove discount');
    }
  };

  const handleSaveOperatorNotes = () => {
    if (!currentBill?.bill?.id || !user) {
      toast.error('Load a visit first');
      return;
    }
    if (visitLocked) {
      toast.error('This visit is read-only');
      return;
    }
    const { roomId } = resolveOperatorBillRoom(rooms, user.room_id, roomType);
    if (!roomId) {
      toast.error(`No ${sectionTitle} is configured. Add it under Admin → Rooms.`);
      return;
    }
    const patch =
      roomType === 'lab'
        ? {
            laboratory_notes: operatorNotes.trim() ? operatorNotes : null,
            laboratory_images: JSON.stringify(operatorImages),
          }
        : roomType === 'xray'
          ? {
              xray_notes: operatorNotes.trim() ? operatorNotes : null,
              xray_images: JSON.stringify(operatorImages),
            }
          : { surgery_notes: operatorNotes.trim() ? operatorNotes : null };
    try {
      upsertMedicalRecordFields(currentBill.bill.id, { id: user.id, name: user.name }, roomId, patch);
      toast.success('Clinical notes saved');
      const refreshed = getBillWithDetails(currentBill.bill.id);
      if (refreshed) setCurrentBill(refreshed);
    } catch (e) {
      toast.error('Could not save clinical notes');
      console.error(e);
    }
  };

  const handleComplete = () => {
    if (!currentToken || !user) return;
    if (visitLocked) return;

    const { roomId } = resolveOperatorBillRoom(rooms, user.room_id, roomType);
    if (!roomId) {
      toast.error(`Cannot resolve ${sectionTitle} room`);
      return;
    }

    const result = completeOperatorRoomVisit(currentToken.token.id, roomId);
    if (result.legacyCompleted) {
      toast.success('Visit completed');
    } else if (result.returnedToDoctor) {
      toast.success('Done here — patient sent back to doctor queue');
    } else if (result.moreReferralsPending) {
      toast.success('Done here — patient still has other referrals today');
    }

    clearCurrentPatient();
  };

  const handleSendOperatorReferrals = () => {
    if (!currentToken || !user) return;
    if (visitLocked) {
      toast.error('Cannot refer a completed or cancelled visit');
      return;
    }

    const selected = operatorReferralOptions.filter((r) => referralTargets.has(r.value));
    if (selected.length === 0) {
      toast.error('Select at least one destination');
      return;
    }

    const roomIds: number[] = [];
    const missing: string[] = [];
    for (const r of selected) {
      const targetRoom = rooms.find((x) => x.type === r.value);
      if (!targetRoom) missing.push(r.label);
      else roomIds.push(targetRoom.id);
    }
    if (missing.length > 0) {
      toast.error(`Add these in Admin → Rooms: ${missing.join(', ')}`);
      return;
    }

    referPatientToRooms(currentToken.token.id, roomIds);
    toast.success(
      selected.length === 1
        ? `Patient referred to ${selected[0].label}`
        : `Referred to ${selected.length} places: ${selected.map((s) => s.label).join(', ')}`
    );

    clearCurrentPatient();
    refreshRoomQueue();
  };

  const renderQueueRow = (row: RoomQueueItem) => {
    const active = currentToken?.token?.id === row.token_id;
    const tok = getTokenById(row.token_id);
    const direct = isDirectEntryToken(tok);
    return (
      <li key={row.token_id}>
        <button
          type="button"
          onClick={() => openQueueRow(row)}
          className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
            active ? 'border-primary/45 bg-secondary/60' : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">#{row.token_number}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {direct && (
                <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-900 border-sky-200">
                  Direct
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] uppercase shrink-0 ${statusBadgeClass(row.status)}`}>
                {row.status}
              </Badge>
            </div>
          </div>
          <p className="text-slate-700 truncate mt-0.5">{row.patient_name}</p>
          <p className="text-xs text-slate-500 truncate">{row.animal_name}</p>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6 w-full">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Search className="w-5 h-5" />
              Load visit by token
            </CardTitle>
            {currentToken && (
              <Button type="button" variant="outline" size="sm" onClick={clearCurrentPatient}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 12 or #12"
                value={tokenNumber}
                onChange={(e) => setTokenNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchToken()}
                className="flex-1"
              />
              <Button type="button" onClick={handleSearchToken}>
                <Search className="w-4 h-4 mr-2" />
                Load
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Enter any today&apos;s token or pick from the queue. Active visits are attached to {sectionTitle} when you
              open them. Use <strong className="font-medium text-slate-700">All patients</strong> to see everyone today;{' '}
              <strong className="font-medium text-slate-700">Refer</strong> sends the loaded visit to another department.
            </p>
          </CardContent>
        </Card>

        {currentToken && (
          <>
            <Card className="bg-secondary/60 border-primary/25">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{currentToken.patient?.owner_name}</p>
                      <p className="text-sm text-slate-600">{currentToken.patient?.owner_phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">Token #{currentToken.token.token_number}</p>
                      <p className="text-sm text-slate-600">
                        Bill: {currentToken.bill?.bill_code ?? currentBill?.bill?.bill_code ?? '—'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(String(currentToken.token.status))}
                    >
                      {currentToken.token.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-primary/25 flex items-center gap-4">
                  <PawPrint className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{currentToken.animal?.name}</p>
                    <p className="text-sm text-slate-600">
                      {currentToken.animal?.type}{' '}
                      {currentToken.animal?.breed && `- ${currentToken.animal.breed}`}
                      {currentToken.animal?.age &&
                        `, ${currentToken.animal.age} ${currentToken.animal.age_unit}`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {visitLocked && (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
              >
                This visit is read-only (completed or cancelled).
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Add charges
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <QuickChargeSection
                  presets={getQuickChargePresets(roomType)}
                  resetKey={currentToken?.token?.id ?? null}
                  visitLocked={visitLocked}
                  onAddLine={handleAddBillLine}
                  customItemType={defaultItemType}
                  presetHint={`Standard ${sectionTitle.toLowerCase()} fees — set quantity and Add. Custom lines count as ${defaultItemType.replace('_', ' ')} for this room.`}
                />

                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <Label className="flex items-center gap-2 text-slate-800">
                    <Percent className="w-4 h-4" />
                    Bill discount (%)
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      placeholder="e.g. 10"
                      value={billDiscountPercent}
                      onChange={(e) => setBillDiscountPercent(e.target.value)}
                      className="w-28 bg-white"
                      disabled={visitLocked}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyBillDiscount}
                      disabled={visitLocked}
                    >
                      {Number(currentBill?.bill?.discount_percent) > 0 ? 'Update' : 'Apply'}
                    </Button>
                    {Number(currentBill?.bill?.discount_percent) > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveBillDiscount}
                        disabled={visitLocked}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="font-medium mb-2">Current bill items</h4>
                  {(!currentBill?.items || currentBill.items.length === 0) && (
                    <p className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      No line items yet. Add a charge above.
                    </p>
                  )}
                  {currentBill?.items && currentBill.items.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-1 text-sm">Item</th>
                            <th className="text-right py-1 text-sm">Qty</th>
                            <th className="text-right py-1 text-sm">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBill.items.map((item: any) => {
                            const itemId = Number(item?.id);
                            const isEditing = editingItemId === itemId;
                            const canEdit = canModifyBillItem(item);

                            const qtyNum = isEditing ? parseInt(editItemQty, 10) : Number(item?.quantity);
                            const unitNum = isEditing
                              ? parseFloat(String(editItemPrice).replace(/,/g, ''))
                              : Number(item?.unit_price);
                            const totalNum = Number.isFinite(qtyNum) && Number.isFinite(unitNum) ? qtyNum * unitNum : 0;

                            return (
                              <tr key={item.id} className="border-b border-slate-100">
                                <td className="py-2 text-sm">
                                  {isEditing ? (
                                    <Input
                                      value={editItemName}
                                      onChange={(e) => setEditItemName(e.target.value)}
                                      disabled={visitLocked}
                                      className="h-8 w-56"
                                    />
                                  ) : (
                                    item.item_name
                                  )}
                                </td>
                                <td className="py-2 text-sm text-right">
                                  {isEditing ? (
                                    <Input
                                      type="number"
                                      min={1}
                                      value={editItemQty}
                                      onChange={(e) => setEditItemQty(e.target.value)}
                                      disabled={visitLocked}
                                      className="h-8 w-20 ml-auto"
                                    />
                                  ) : (
                                    item.quantity
                                  )}
                                </td>
                                <td className="py-2 text-sm text-right">
                                  {isEditing ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={editItemPrice}
                                        onChange={(e) => setEditItemPrice(e.target.value)}
                                        disabled={visitLocked}
                                        className="h-8 w-28"
                                      />
                                      <div className="text-xs text-slate-600">
                                        Total: Rs. {Number(totalNum).toLocaleString('en-IN')}
                                      </div>
                                      <div className="flex items-center gap-1 pt-1">
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          className="h-8 w-8"
                                          onClick={() => handleSaveItemEdit(itemId)}
                                          disabled={visitLocked}
                                        >
                                          <Save className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8"
                                          onClick={cancelEditItem}
                                          disabled={visitLocked}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex justify-end items-center gap-2">
                                      <span>Rs. {Number(item.total_price).toLocaleString('en-IN')}</span>
                                      {canEdit && (
                                        <>
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            className="h-8 w-8"
                                            onClick={() => startEditItem(item)}
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-red-600 hover:text-red-700"
                                            onClick={() => handleDeleteItem(itemId)}
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          {Number(currentBill.bill.discount_amount) > 0 && (
                            <tr className="text-sm text-green-700">
                              <td className="py-1" colSpan={2}>
                                Discount ({currentBill.bill.discount_percent}%)
                              </td>
                              <td className="py-1 text-right">
                                −Rs. {Number(currentBill.bill.discount_amount).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          )}
                          <tr className="font-semibold">
                            <td className="py-2" colSpan={2}>
                              Subtotal
                            </td>
                            <td className="py-2 text-right">
                              Rs. {Number(currentBill.bill.total_amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                          <tr className="font-bold text-base text-primary">
                            <td className="py-2" colSpan={2}>
                              Patient total
                            </td>
                            <td className="py-2 text-right">
                              Rs. {Number(currentBill.bill.final_amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                  <Label htmlFor={`op-notes-${roomType}`} className="text-slate-800">
                    Clinical notes ({sectionTitle})
                  </Label>
                  <Textarea
                    id={`op-notes-${roomType}`}
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                    placeholder={
                      roomType === 'lab'
                        ? 'Test results, values, or technical findings…'
                        : roomType === 'xray'
                          ? 'Views taken, exposure, technical observations…'
                          : 'Procedure summary, findings, operative notes…'
                    }
                    rows={4}
                    disabled={visitLocked}
                    className="bg-white"
                  />
                  {(roomType === 'lab' || roomType === 'xray') && (
                    <div className="space-y-2 pt-1">
                      <Label className="flex items-center gap-2 text-slate-800">
                        <ImagePlus className="w-4 h-4 shrink-0" />
                        Attach images (max 5, 2 MB each)
                      </Label>
                      <p className="text-xs text-slate-500">
                        Photos of reports, strips, or films — stored in this browser only.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          multiple
                          className="max-w-xs bg-white"
                          disabled={visitLocked}
                          onChange={handleOperatorImagesChange}
                        />
                        <span className="text-xs text-slate-500">{operatorImages.length} / 5</span>
                      </div>
                      {operatorImages.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {operatorImages.map((src, i) => (
                            <div
                              key={i}
                              className="relative group w-24 h-24 border rounded overflow-hidden bg-white"
                            >
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              {!visitLocked && (
                                <button
                                  type="button"
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded p-0.5 opacity-90 hover:opacity-100"
                                  onClick={() => removeOperatorImageAt(i)}
                                  aria-label="Remove image"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={handleSaveOperatorNotes}
                    disabled={visitLocked}
                  >
                    Save clinical notes
                  </Button>
                </div>

                <Button
                  type="button"
                  onClick={handleComplete}
                  className="w-full"
                  variant="default"
                  disabled={visitLocked}
                >
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Complete visit
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <aside className="w-full xl:w-96 shrink-0 self-start">
        <Card className="xl:fixed xl:top-4 xl:right-4 xl:w-96">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 min-w-0">
              <ListOrdered className="w-5 h-5 shrink-0" />
              <span className="truncate">Room queue</span>
            </CardTitle>
            <Button type="button" variant="ghost" size="icon" onClick={refreshRoomQueue} aria-label="Refresh queue">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs
              value={sidebarTab}
              onValueChange={(v) => setSidebarTab(v as 'queue' | 'all' | 'refer')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
                <TabsTrigger value="queue" className="text-xs px-1.5 py-2">
                  This room
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs px-1.5 py-2">
                  All patients
                </TabsTrigger>
                <TabsTrigger value="refer" className="text-xs px-1.5 py-2">
                  Refer
                </TabsTrigger>
              </TabsList>

              <TabsContent value="queue" className="mt-3 space-y-0">
                <p className="text-xs text-slate-500 mb-2">
                  Waiting for {sectionTitle} (direct visits, referrals, or assigned here).
                </p>
                {roomQueue.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No one in this room&apos;s queue today.</p>
                ) : (
                  <ul className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
                    {roomQueue.map((row) => renderQueueRow(row))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="all" className="mt-3 space-y-0">
                <p className="text-xs text-slate-500 mb-2">
                  Everyone still active today (waiting or in progress). Tap to open — the visit is attached to{' '}
                  {sectionTitle} for billing and notes.
                </p>
                {allActiveQueue.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No active visits today.</p>
                ) : (
                  <ul className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
                    {allActiveQueue.map((row) => renderQueueRow(row))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="refer" className="mt-3 space-y-3">
                <p className="text-xs text-slate-600">
                  Send the <strong className="font-medium text-slate-800">loaded visit</strong> to other departments. No
                  doctor referral is required — same as reception direct routing.
                </p>
                {!currentToken ? (
                  <p className="text-sm text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-200">
                    Load a patient from the queue or enter a token number first.
                  </p>
                ) : visitLocked ? (
                  <p className="text-sm text-amber-800 py-2">This visit is read-only — cannot refer.</p>
                ) : (
                  <>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 mb-2 text-xs text-slate-700">
                      Token #{currentToken.token.token_number} · {currentToken.patient?.owner_name}
                    </div>
                    <div className="flex flex-col gap-2 max-h-[min(50vh,22rem)] overflow-y-auto pr-1">
                      {operatorReferralOptions.map((room) => (
                        <label
                          key={room.value}
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            referralTargets.has(room.value)
                              ? 'border-primary/45 bg-secondary/60'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Checkbox
                            checked={referralTargets.has(room.value)}
                            onCheckedChange={() => {
                              setReferralTargets((prev) => {
                                const next = new Set(prev);
                                if (next.has(room.value)) next.delete(room.value);
                                else next.add(room.value);
                                return next;
                              });
                            }}
                          />
                          <span className="font-medium text-slate-900 text-sm">{room.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReferralTargets(new Set(operatorReferralOptions.map((r) => r.value)))}
                      >
                        Select all
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setReferralTargets(new Set())}>
                        Clear
                      </Button>
                    </div>
                    <Button type="button" className="w-full" onClick={handleSendOperatorReferrals}>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Send to selected
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function LabModule() {
  return <RoomOperatorModule roomType="lab" />;
}

export function XRayModule() {
  return <RoomOperatorModule roomType="xray" />;
}

export function SurgeryModule() {
  return <RoomOperatorModule roomType="surgery" />;
}
