import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
import {
  getTokenByNumber,
  getTokenWithDetails,
  startToken,
  getTokenById,
  getWaitingTokensByRoomType,
  activateReferralAtRoom,
  hasPendingReferralToRoom,
  completeOperatorRoomVisit,
} from '@/lib/services/tokenService';
import { getBillWithDetails, addBillItem, applyDiscount } from '@/lib/services/billingService';
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
  const [rooms, setRooms] = useState<Room[]>(() => getAllRooms());

  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [billDiscountPercent, setBillDiscountPercent] = useState('');

  useEffect(() => {
    setRooms(getAllRooms());
  }, []);

  const refreshRoomQueue = () => {
    try {
      setRoomQueue(getWaitingTokensByRoomType(roomType));
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
    if (!currentToken?.token?.id) return;
    setCustomItemName('');
    setCustomItemPrice('');
    setItemQuantity('1');
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

  const statusBadgeClass = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-amber-100 text-amber-900 border-amber-200',
      in_progress: 'bg-blue-100 text-blue-900 border-blue-200',
      completed: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      cancelled: 'bg-red-100 text-red-900 border-red-200',
    };
    return styles[status] || 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const visitLocked =
    currentToken?.token?.status === 'completed' || currentToken?.token?.status === 'cancelled';

  const tokenRoomMatchesThisSection = (token: Token): boolean => {
    const { roomId: opRoomId } = resolveOperatorBillRoom(rooms, user?.room_id, roomType);
    if (!opRoomId) return false;
    if (Number(token.room_id) === opRoomId) return true;
    return hasPendingReferralToRoom(token.id, opRoomId);
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
    if (hasPendingReferralToRoom(token.id, opRoomId) && Number(token.room_id) !== opRoomId) {
      activateReferralAtRoom(token.id, opRoomId);
      const re = getTokenById(token.id);
      if (!re) {
        toast.error('Token no longer available');
        return false;
      }
      working = re;
    }

    if (!tokenRoomMatchesThisSection(working)) {
      toast.error(
        `This token is not assigned to ${sectionTitle}. Refer the patient from Doctor Room first.`
      );
      return false;
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
      toast.error(`No token #${n} for today. Check the number or pick from this room's queue.`);
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

  const handleAddCharge = () => {
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

    if (!customItemName.trim()) {
      toast.error('Please enter item name');
      return;
    }
    const unit = parseFloat(String(customItemPrice).replace(/,/g, ''));
    if (!Number.isFinite(unit) || unit <= 0) {
      toast.error('Enter a valid unit price greater than zero');
      return;
    }
    const qty = parseInt(String(itemQuantity), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Enter a valid quantity (at least 1)');
      return;
    }

    const itemData: BillItemFormData = {
      item_name: customItemName.trim(),
      item_type: defaultItemType,
      quantity: qty,
      unit_price: unit,
      notes: '',
    };

    try {
      addBillItem(currentBill.bill.id, itemData, roomId, roomName, user.id, user.name);

      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      if (updatedBill && currentToken?.token?.id) {
        setCurrentToken(getTokenWithDetails(currentToken.token.id));
      }

      toast.success('Charge added successfully');

      setCustomItemName('');
      setCustomItemPrice('');
      setItemQuantity('1');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add charge');
      console.error(error);
    }
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
              Only tokens currently assigned to {sectionTitle} can be opened here. Use the queue on the right or enter
              the token number.
            </p>
          </CardContent>
        </Card>

        {currentToken && (
          <>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
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
                <div className="mt-4 pt-4 border-t border-blue-200 flex items-center gap-4">
                  <PawPrint className="w-5 h-5 text-blue-600" />
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
                <div className="space-y-2">
                  <Label>Service / item</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Input
                      placeholder="Item name"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      className="flex-1 min-w-[12rem]"
                      disabled={visitLocked}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Price"
                      value={customItemPrice}
                      onChange={(e) => setCustomItemPrice(e.target.value)}
                      className="w-28"
                      disabled={visitLocked}
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="w-20"
                      disabled={visitLocked}
                    />
                    <Button type="button" onClick={() => handleAddCharge()} disabled={visitLocked}>
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Line items are recorded as <span className="font-medium">{defaultItemType.replace('_', ' ')}</span>{' '}
                    charges for this room.
                  </p>
                </div>

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
                          {currentBill.items.map((item: any) => (
                            <tr key={item.id} className="border-b border-slate-100">
                              <td className="py-2 text-sm">{item.item_name}</td>
                              <td className="py-2 text-sm text-right">{item.quantity}</td>
                              <td className="py-2 text-sm text-right">₹{item.total_price}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          {Number(currentBill.bill.discount_amount) > 0 && (
                            <tr className="text-sm text-green-700">
                              <td className="py-1" colSpan={2}>
                                Discount ({currentBill.bill.discount_percent}%)
                              </td>
                              <td className="py-1 text-right">
                                −₹{Number(currentBill.bill.discount_amount).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          )}
                          <tr className="font-semibold">
                            <td className="py-2" colSpan={2}>
                              Subtotal
                            </td>
                            <td className="py-2 text-right">
                              ₹{Number(currentBill.bill.total_amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                          <tr className="font-bold text-base text-blue-800">
                            <td className="py-2" colSpan={2}>
                              Patient total
                            </td>
                            <td className="py-2 text-right">
                              ₹{Number(currentBill.bill.final_amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
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

      <aside className="w-full xl:w-80 shrink-0">
        <Card className="xl:sticky xl:top-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ListOrdered className="w-5 h-5" />
              {sectionTitle} queue
            </CardTitle>
            <Button type="button" variant="ghost" size="icon" onClick={refreshRoomQueue} aria-label="Refresh queue">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {roomQueue.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No patients waiting in this room today.</p>
            ) : (
              <ul className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
                {roomQueue.map((row) => {
                  const active = currentToken?.token?.id === row.token_id;
                  return (
                    <li key={row.token_id}>
                      <button
                        type="button"
                        onClick={() => openQueueRow(row)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">#{row.token_number}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase shrink-0 ${statusBadgeClass(row.status)}`}
                          >
                            {row.status}
                          </Badge>
                        </div>
                        <p className="text-slate-700 truncate mt-0.5">{row.patient_name}</p>
                        <p className="text-xs text-slate-500 truncate">{row.animal_name}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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
