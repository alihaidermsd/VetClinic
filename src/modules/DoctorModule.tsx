import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Stethoscope,
  FileText,
  Plus,
  ArrowRight,
  User,
  PawPrint,
  ClipboardList,
  RefreshCw,
  ListOrdered,
  X,
  Percent,
  FlaskConical,
  Scan,
  Scissors,
} from 'lucide-react';
import {
  getTokenByNumber,
  getTokenWithDetails,
  referPatientToRooms,
  startToken,
  completeToken,
  getTodayTokensForDashboard,
  getTokenById,
} from '@/lib/services/tokenService';
import { getBillWithDetails, addBillItem, applyDiscount } from '@/lib/services/billingService';
import {
  getMedicalRecordsByBillId,
  parseImageJsonArray,
  saveMedicalRecordForBill,
} from '@/lib/services/medicalService';
import { getAllRooms } from '@/lib/services/roomService';
import { useAuth } from '@/hooks/useAuth';
import type { BillItemFormData, Room, Token } from '@/types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

const REFERRAL_ROOMS = [
  { value: 'lab', label: 'Laboratory' },
  { value: 'xray', label: 'X-Ray Room' },
  { value: 'surgery', label: 'Surgery Room' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

function resolveDoctorBillRoom(
  rooms: Room[],
  assignedRoomId: number | null | undefined
): { roomId: number; roomName: string } {
  const id = assignedRoomId != null ? Number(assignedRoomId) : 0;
  if (id > 0) {
    const match = rooms.find((r) => Number(r.id) === id);
    if (match) {
      return { roomId: match.id, roomName: String(match.name || 'Doctor room') };
    }
  }
  const first = rooms.find((r) => r.type === 'doctor_room');
  return {
    roomId: first?.id ?? 0,
    roomName: String(first?.name || 'Doctor Room'),
  };
}

export function DoctorModule() {
  const { user } = useAuth();
  const [tokenNumber, setTokenNumber] = useState('');
  const [currentToken, setCurrentToken] = useState<any>(null);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [tokenQueue, setTokenQueue] = useState<ReturnType<typeof getTodayTokensForDashboard>>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('examination');

  // Medical record form
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [laboratoryNotes, setLaboratoryNotes] = useState('');
  const [laboratoryExamination, setLaboratoryExamination] = useState('');
  const [xrayNotes, setXrayNotes] = useState('');
  const [xrayExamination, setXrayExamination] = useState('');
  const [xrayImageList, setXrayImageList] = useState<string[]>([]);
  const [surgeryNotes, setSurgeryNotes] = useState('');
  const [surgeryExamination, setSurgeryExamination] = useState('');

  // Billing form
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [billDiscountPercent, setBillDiscountPercent] = useState('');
  const [referralTargets, setReferralTargets] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    setReferralTargets(new Set());
  }, [currentToken?.token?.id]);

  const refreshTokenQueue = () => {
    try {
      setTokenQueue(getTodayTokensForDashboard());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshTokenQueue();
    const t = setInterval(refreshTokenQueue, 15000);
    return () => clearInterval(t);
  }, []);

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

  /** Load or reset examination fields when the active visit changes; prefer latest saved record for this bill. */
  useEffect(() => {
    if (!currentToken?.token?.id) return;
    const billId = currentBill?.bill?.id;
    if (billId == null) {
      setDiagnosis('');
      setSymptoms('');
      setTreatment('');
      setNotes('');
      setFollowUpDate('');
      setLaboratoryNotes('');
      setLaboratoryExamination('');
      setXrayNotes('');
      setXrayExamination('');
      setXrayImageList([]);
      setSurgeryNotes('');
      setSurgeryExamination('');
      return;
    }
    const records = getMedicalRecordsByBillId(billId);
    const latest = records[0];
    if (latest) {
      setDiagnosis(latest.diagnosis ?? '');
      setSymptoms(latest.symptoms ?? '');
      setTreatment(latest.treatment ?? '');
      setNotes(latest.notes ?? '');
      setFollowUpDate(latest.follow_up_date ?? '');
      setLaboratoryNotes(latest.laboratory_notes ?? '');
      setLaboratoryExamination(latest.laboratory_examination ?? '');
      setXrayNotes(latest.xray_notes ?? '');
      setXrayExamination(latest.xray_examination ?? '');
      setXrayImageList(parseImageJsonArray(latest.xray_images));
      setSurgeryNotes(latest.surgery_notes ?? '');
      setSurgeryExamination(latest.surgery_examination ?? '');
    } else {
      setDiagnosis('');
      setSymptoms('');
      setTreatment('');
      setNotes('');
      setFollowUpDate('');
      setLaboratoryNotes('');
      setLaboratoryExamination('');
      setXrayNotes('');
      setXrayExamination('');
      setXrayImageList([]);
      setSurgeryNotes('');
      setSurgeryExamination('');
    }
    setActiveTab('examination');
  }, [currentToken?.token?.id, currentBill?.bill?.id]);

  const loadRooms = () => {
    const allRooms = getAllRooms();
    setRooms(allRooms);
  };

  /** Load examination UI for a token; starts visit only when status is `waiting`. */
  const loadVisitForToken = (token: Token, options?: { silent?: boolean }): boolean => {
    if (token.status === 'cancelled') {
      toast.error('This token is cancelled');
      return false;
    }

    const tokenDetails = getTokenWithDetails(token.id);
    if (!tokenDetails) {
      toast.error('Failed to load token details');
      return false;
    }

    const billDetails = getBillWithDetails(token.bill_id);
    if (!billDetails) {
      toast.error('Bill not found for this token');
      return false;
    }

    setCurrentToken(tokenDetails);
    setCurrentBill(billDetails);

    if (token.status === 'waiting') {
      startToken(token.id);
      const refreshedBill = getBillWithDetails(token.bill_id) || billDetails;
      setCurrentBill(refreshedBill);
      const refreshedToken = getTokenWithDetails(token.id);
      if (refreshedToken) setCurrentToken(refreshedToken);
    }

    refreshTokenQueue();
    if (!options?.silent) {
      const n = token.token_number;
      if (token.status === 'completed') {
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
      toast.error(`No token #${n} for today. Check the number or pick from today's list.`);
      refreshTokenQueue();
      return;
    }

    loadVisitForToken(token);
  };

  const openQueueRow = (row: (typeof tokenQueue)[number]) => {
    const token = getTokenById(row.id);
    if (!token) {
      toast.error('Token no longer available');
      refreshTokenQueue();
      return;
    }
    loadVisitForToken(token);
  };

  const clearCurrentPatient = () => {
    setCurrentToken(null);
    setCurrentBill(null);
    setTokenNumber('');
    refreshTokenQueue();
  };

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

  const handleAddCharge = () => {
    if (!currentToken || !currentBill || !user) return;
    if (visitLocked) {
      toast.error('This visit is completed or cancelled — charges cannot be edited.');
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
      item_type: 'procedure',
      quantity: qty,
      unit_price: unit,
      notes: '',
    };

    try {
      const { roomId, roomName } = resolveDoctorBillRoom(rooms, user.room_id);
      addBillItem(currentBill.bill.id, itemData, roomId, roomName, user.id, user.name);

      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);
      if (updatedBill && currentToken?.token?.id) {
        setCurrentToken(getTokenWithDetails(currentToken.token.id));
      }

      toast.success('Charge added successfully');
      
      // Reset form
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

  const removeXrayImageAt = (index: number) => {
    setXrayImageList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleXrayImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const maxImages = 5;
    const maxBytes = 2 * 1024 * 1024;
    const next: string[] = [...xrayImageList];
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
    setXrayImageList(next);
    e.target.value = '';
  };

  const handleSaveMedicalRecord = () => {
    if (!currentToken || !currentBill || !user) {
      toast.error('Load a visit first');
      return;
    }
    if (!currentToken.patient?.id || !currentToken.animal?.id) {
      toast.error('Patient or animal data is missing for this visit — reload the token.');
      return;
    }
    if (visitLocked) {
      toast.error('This visit is completed or cancelled — examination cannot be edited.');
      return;
    }

    const textFields = [
      symptoms,
      diagnosis,
      treatment,
      notes,
      followUpDate,
      laboratoryNotes,
      laboratoryExamination,
      xrayNotes,
      xrayExamination,
      surgeryNotes,
      surgeryExamination,
    ];
    const hasContent =
      textFields.some((s) => String(s ?? '').trim().length > 0) || xrayImageList.length > 0;
    if (!hasContent) {
      toast.error(
        'Enter at least one field in general examination, lab/X-ray/surgery sections, attach an X-ray image, or set follow-up date'
      );
      return;
    }

    try {
      saveMedicalRecordForBill({
        bill_id: currentBill.bill.id,
        patient_id: currentToken.patient.id,
        animal_id: currentToken.animal.id,
        doctor_id: user.id,
        doctor_name: user.name,
        room_id: resolveDoctorBillRoom(rooms, user.room_id).roomId,
        diagnosis,
        symptoms,
        treatment,
        notes,
        follow_up_date: followUpDate.trim() ? followUpDate : null,
        laboratory_notes: laboratoryNotes.trim() ? laboratoryNotes : null,
        laboratory_examination: laboratoryExamination.trim() ? laboratoryExamination : null,
        xray_notes: xrayNotes.trim() ? xrayNotes : null,
        xray_examination: xrayExamination.trim() ? xrayExamination : null,
        xray_images: JSON.stringify(xrayImageList),
        surgery_notes: surgeryNotes.trim() ? surgeryNotes : null,
        surgery_examination: surgeryExamination.trim() ? surgeryExamination : null,
      });

      const savedRows = getMedicalRecordsByBillId(currentBill.bill.id);
      const latest = savedRows[0];
      if (latest) {
        setDiagnosis(latest.diagnosis ?? '');
        setSymptoms(latest.symptoms ?? '');
        setTreatment(latest.treatment ?? '');
        setNotes(latest.notes ?? '');
        setFollowUpDate(latest.follow_up_date ?? '');
        setLaboratoryNotes(latest.laboratory_notes ?? '');
        setLaboratoryExamination(latest.laboratory_examination ?? '');
        setXrayNotes(latest.xray_notes ?? '');
        setXrayExamination(latest.xray_examination ?? '');
        setXrayImageList(parseImageJsonArray(latest.xray_images));
        setSurgeryNotes(latest.surgery_notes ?? '');
        setSurgeryExamination(latest.surgery_examination ?? '');
      }

      const refreshed = getBillWithDetails(currentBill.bill.id);
      if (refreshed) setCurrentBill(refreshed);

      toast.success('Medical record saved');
    } catch (error) {
      toast.error('Failed to save medical record');
      console.error(error);
    }
  };

  const handleSendReferrals = () => {
    if (!currentToken) return;
    if (visitLocked) {
      toast.error('Cannot refer a completed or cancelled visit');
      return;
    }

    const selected = REFERRAL_ROOMS.filter((r) => referralTargets.has(r.value));
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

    setCurrentToken(null);
    setCurrentBill(null);
    setTokenNumber('');
    setReferralTargets(new Set());
    refreshTokenQueue();
  };

  const handleComplete = () => {
    if (!currentToken) return;

    completeToken(currentToken.token.id);
    toast.success('Token completed');

    clearCurrentPatient();
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6 w-full">
        {/* Token Search — always available */}
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
              Tokens are matched to today&apos;s date (local). You can also select a row in Today&apos;s queue.
            </p>
          </CardContent>
        </Card>

      {/* Patient Details */}
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
                    {currentToken.animal?.type} {currentToken.animal?.breed && `- ${currentToken.animal.breed}`}
                    {currentToken.animal?.age && `, ${currentToken.animal.age} ${currentToken.animal.age_unit}`}
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
              This visit is read-only (completed or cancelled). Open an active visit to edit examination notes, add
              charges, or refer.
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="examination">Examination</TabsTrigger>
              <TabsTrigger value="billing">Add Charges</TabsTrigger>
              <TabsTrigger value="referral">Referral</TabsTrigger>
            </TabsList>

            {/* Examination Tab */}
            <TabsContent value="examination" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="w-5 h-5" />
                    Medical Examination
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="symptoms">Symptoms</Label>
                    <Textarea
                      id="symptoms"
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                      placeholder="Enter observed symptoms"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diagnosis">Diagnosis</Label>
                    <Textarea
                      id="diagnosis"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Enter diagnosis"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="treatment">Treatment Plan</Label>
                    <Textarea
                      id="treatment"
                      value={treatment}
                      onChange={(e) => setTreatment(e.target.value)}
                      placeholder="Enter treatment plan"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes"
                      rows={2}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followUp">Follow-up Date</Label>
                    <Input
                      id="followUp"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      disabled={visitLocked}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="w-5 h-5 text-emerald-700" />
                    Laboratory
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Operator findings and your clinical interpretation after lab work.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="labNotes">Lab / technical notes</Label>
                    <Textarea
                      id="labNotes"
                      value={laboratoryNotes}
                      onChange={(e) => setLaboratoryNotes(e.target.value)}
                      placeholder="Results or notes from the laboratory (can be filled by lab staff or you)"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labExam">Doctor examination after laboratory</Label>
                    <Textarea
                      id="labExam"
                      value={laboratoryExamination}
                      onChange={(e) => setLaboratoryExamination(e.target.value)}
                      placeholder="Your examination and interpretation of lab results"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scan className="w-5 h-5 text-sky-700" />
                    X-Ray
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Imaging notes, your report, and attached images (stored in this browser only).
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="xrayOp">X-ray / operator notes</Label>
                    <Textarea
                      id="xrayOp"
                      value={xrayNotes}
                      onChange={(e) => setXrayNotes(e.target.value)}
                      placeholder="Technical notes from imaging"
                      rows={2}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="xrayExam">Doctor examination / report after X-ray</Label>
                    <Textarea
                      id="xrayExam"
                      value={xrayExamination}
                      onChange={(e) => setXrayExamination(e.target.value)}
                      placeholder="Radiological interpretation and clinical correlation"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>X-ray images (max 5, 2 MB each)</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        className="max-w-xs"
                        disabled={visitLocked}
                        onChange={handleXrayImagesChange}
                      />
                      <span className="text-xs text-slate-500">{xrayImageList.length} / 5</span>
                    </div>
                    {xrayImageList.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {xrayImageList.map((src, i) => (
                          <div key={i} className="relative group w-24 h-24 border rounded overflow-hidden bg-slate-100">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            {!visitLocked && (
                              <button
                                type="button"
                                className="absolute top-1 right-1 bg-red-600 text-white rounded p-0.5 opacity-90 hover:opacity-100"
                                onClick={() => removeXrayImageAt(i)}
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scissors className="w-5 h-5 text-rose-700" />
                    Surgery
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Operative notes and full surgical examination summary.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="surgNotes">Surgery room / operative notes</Label>
                    <Textarea
                      id="surgNotes"
                      value={surgeryNotes}
                      onChange={(e) => setSurgeryNotes(e.target.value)}
                      placeholder="Procedure notes from the surgery room"
                      rows={3}
                      disabled={visitLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surgExam">Doctor surgical examination &amp; case summary</Label>
                    <Textarea
                      id="surgExam"
                      value={surgeryExamination}
                      onChange={(e) => setSurgeryExamination(e.target.value)}
                      placeholder="Pre-/intra-/post-operative assessment, procedure summary, recovery instructions"
                      rows={4}
                      disabled={visitLocked}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="button"
                onClick={handleSaveMedicalRecord}
                className="w-full"
                disabled={visitLocked}
              >
                <FileText className="w-4 h-4 mr-2" />
                Save Medical Record
              </Button>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add Charges
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Custom Charge */}
                  <div className="space-y-2">
                    <Label>Custom Charge</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Item name"
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        className="flex-1"
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
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <Label className="flex items-center gap-2 text-slate-800">
                      <Percent className="w-4 h-4" />
                      Bill discount (%)
                    </Label>
                    <p className="text-xs text-slate-600">
                      If the customer asks for a discount, set a percentage off the full bill (including pharmacy items
                      later).
                    </p>
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
                      <Button type="button" variant="secondary" size="sm" onClick={handleApplyBillDiscount} disabled={visitLocked}>
                        {Number(currentBill?.bill?.discount_percent) > 0 ? 'Update' : 'Apply'}
                      </Button>
                      {Number(currentBill?.bill?.discount_percent) > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={handleRemoveBillDiscount} disabled={visitLocked}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Current Bill Items */}
                  <div className="mt-6">
                    <h4 className="font-medium mb-2">Current Bill Items</h4>
                    {(!currentBill?.items || currentBill.items.length === 0) && (
                      <p className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        No line items yet. Add a custom charge above.
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
                                <td className="py-2 text-sm text-right">Rs. {item.total_price}</td>
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
                            <tr className="font-bold text-base text-blue-800">
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
                    {(!currentBill?.items || currentBill.items.length === 0) && currentBill?.bill && (
                      <div className="mt-4 flex flex-wrap justify-end gap-6 text-sm text-slate-600">
                        <span>
                          Subtotal:{' '}
                          <strong className="text-slate-900">
                            Rs. {Number(currentBill.bill.total_amount || 0).toLocaleString('en-IN')}
                          </strong>
                        </span>
                        <span>
                          Patient total:{' '}
                          <strong className="text-blue-800 text-base">
                            Rs. {Number(currentBill.bill.final_amount || 0).toLocaleString('en-IN')}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Referral Tab */}
            <TabsContent value="referral" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5" />
                    Refer patient
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Tick every department this patient should visit today — for example lab and X-ray together, or only
                    pharmacy. They can complete stops in any order unless a room is already busy with them.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {REFERRAL_ROOMS.map((room) => (
                      <label
                        key={room.value}
                        className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                          referralTargets.has(room.value)
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        } ${visitLocked ? 'opacity-60 pointer-events-none' : ''}`}
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
                          disabled={visitLocked}
                        />
                        <span className="font-medium text-slate-900">{room.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReferralTargets(new Set(REFERRAL_ROOMS.map((r) => r.value)))}
                      disabled={visitLocked}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReferralTargets(new Set())}
                      disabled={visitLocked}
                    >
                      Clear
                    </Button>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSendReferrals}
                    disabled={visitLocked}
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Send to selected
                  </Button>

                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      type="button"
                      onClick={handleComplete}
                      className="w-full"
                      variant="secondary"
                      disabled={visitLocked}
                    >
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Complete visit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
      </div>

      {/* Today's token queue */}
      <aside className="w-full xl:w-80 shrink-0">
        <Card className="xl:sticky xl:top-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ListOrdered className="w-5 h-5" />
              Today&apos;s queue
            </CardTitle>
            <Button type="button" variant="ghost" size="icon" onClick={refreshTokenQueue} aria-label="Refresh queue">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {tokenQueue.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No tokens for today yet.</p>
            ) : (
              <ul className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
                {tokenQueue.map((row) => {
                  const active = currentToken?.token?.id === row.id;
                  return (
                    <li key={row.id}>
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
