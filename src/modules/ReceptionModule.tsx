import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Ticket, Printer, Search, RefreshCw, User, Phone, PawPrint, XCircle } from 'lucide-react';
import { createWalkInPatient, searchPatients } from '@/lib/services/patientService';
import {
  createToken,
  cancelToken,
  getTodayTokensForReception,
  type ReceptionTokenRow,
} from '@/lib/services/tokenService';
import { getBillById } from '@/lib/services/billingService';
import { getRoomsByType } from '@/lib/services/roomService';
import { printTokenSlip } from '@/lib/printToken';
import type { Animal, AnimalType, RoomType } from '@/types';
import { toast } from 'sonner';

const RECEPTION_SPECIES_OPTIONS: { value: AnimalType; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'cow', label: 'Cow' },
  { value: 'bird', label: 'Bird' },
  { value: 'tiger', label: 'Tiger' },
  { value: 'other', label: 'Other — type below' },
];

type DirectDept = Extract<RoomType, 'lab' | 'xray' | 'surgery' | 'pharmacy'>;

const DIRECT_DEPT_OPTIONS: { value: DirectDept; label: string }[] = [
  { value: 'lab', label: 'Laboratory' },
  { value: 'xray', label: 'X-Ray' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

function formatPetLineForToken(pet: string, type: AnimalType, customSpecies: string): string {
  if (type === 'other') {
    const s = customSpecies.trim();
    return s ? `${pet} (${s})` : `${pet} (Other)`;
  }
  const label = RECEPTION_SPECIES_OPTIONS.find((o) => o.value === type)?.label ?? type;
  return `${pet} (${label})`;
}

export function ReceptionModule() {
  const [tokenNumberInput, setTokenNumberInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [petName, setPetName] = useState('');
  const [petAnimalType, setPetAnimalType] = useState<AnimalType>('dog');
  const [customSpecies, setCustomSpecies] = useState('');
  const [phone, setPhone] = useState('');

  const [queue, setQueue] = useState<ReceptionTokenRow[]>([]);
  const [visitFlow, setVisitFlow] = useState<'doctor_first' | 'direct'>('doctor_first');
  const [directDept, setDirectDept] = useState<DirectDept>('lab');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    refreshQueue();
    const t = setInterval(refreshQueue, 15000);
    return () => clearInterval(t);
  }, []);

  const refreshQueue = () => {
    setQueue(getTodayTokensForReception());
  };

  const resolveDirectRoomId = (): { roomId: number; label: string } | null => {
    const rooms = getRoomsByType(directDept);
    const id = rooms[0]?.id;
    if (!id) return null;
    const label = DIRECT_DEPT_OPTIONS.find((o) => o.value === directDept)?.label ?? directDept;
    return { roomId: Number(id), label };
  };

  const issueTokenAndPrint = (
    patientId: number,
    animalId: number,
    displayCustomer: string,
    displayPet: string
  ) => {
    const hasManualToken = tokenNumberInput.trim().length > 0;
    const requestedToken = Number(tokenNumberInput);
    if (hasManualToken && (!Number.isFinite(requestedToken) || requestedToken < 1 || !Number.isInteger(requestedToken))) {
      toast.error('Enter a valid token number');
      return;
    }

    let token;
    let visitNote: string | undefined;

    if (visitFlow === 'direct') {
      const resolved = resolveDirectRoomId();
      if (!resolved) {
        toast.error(
          `No ${DIRECT_DEPT_OPTIONS.find((o) => o.value === directDept)?.label ?? 'department'} is set up. Add it under Admin → Rooms.`
        );
        return;
      }
      token = createToken(patientId, animalId, {
        tokenNumber: hasManualToken ? requestedToken : undefined,
        entryKind: 'direct',
        directRoomId: resolved.roomId,
      });
      visitNote = `Direct visit — ${resolved.label}`;
    } else {
      token = createToken(patientId, animalId, {
        tokenNumber: hasManualToken ? requestedToken : undefined,
      });
    }

    const bill = getBillById(token.bill_id);
    const billCode = bill?.bill_code ?? '—';

    const printed = printTokenSlip({
      tokenNumber: token.token_number,
      customerName: displayCustomer,
      petName: displayPet,
      billCode,
      visitNote,
    });

    if (!printed) {
      toast.warning(
        `Token #${token.token_number} created. Allow pop-ups to print, or use Print in today’s list below.`
      );
    } else {
      toast.success(`Token #${token.token_number} — give this printout to the customer.`);
    }
    refreshQueue();
  };

  const handleQuickCreate = () => {
    const c = customerName.trim();
    const p = petName.trim();
    if (!c || !p) {
      toast.error('Enter customer name and pet name.');
      return;
    }
    if (petAnimalType === 'other' && !customSpecies.trim()) {
      toast.error('Choose “Other” species? Enter the animal type (e.g. goat, rabbit).');
      return;
    }
    try {
      const { patient, animal } = createWalkInPatient(c, p, {
        phone,
        animalType: petAnimalType,
        customSpecies: petAnimalType === 'other' ? customSpecies : undefined,
      });
      const petLine = formatPetLineForToken(p, petAnimalType, customSpecies);
      issueTokenAndPrint(patient.id, animal.id, c, petLine);
      setCustomerName('');
      setPetName('');
      setPetAnimalType('dog');
      setCustomSpecies('');
      setPhone('');
      setTokenNumberInput('');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Could not create token. Try again.');
    }
  };

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchResults(searchPatients(searchTerm));
  };

  const handleReprint = (row: ReceptionTokenRow) => {
    const ok = printTokenSlip({
      tokenNumber: row.token_number,
      customerName: row.patient_name,
      petName: row.animal_name,
      billCode: row.bill_code,
    });
    if (ok) toast.success(`Printing token #${row.token_number}`);
    else toast.error('Pop-up blocked — allow pop-ups to print.');
  };

  const handleCancelToken = (row: ReceptionTokenRow) => {
    if (row.status === 'completed' || row.status === 'cancelled') {
      toast.message(`Token #${row.token_number} cannot be cancelled`);
      return;
    }
    const ok = window.confirm(
      `Cancel token #${row.token_number} for ${row.patient_name}?`
    );
    if (!ok) return;
    const updated = cancelToken(Number(row.id));
    if (!updated) {
      toast.error('Failed to cancel token');
      return;
    }
    refreshQueue();
    toast.success(`Token #${row.token_number} cancelled`);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-secondary text-primary',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-6xl mx-auto p-4 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <Card className="border-2 border-primary/15 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Ticket className="w-6 h-6 text-primary" />
            New queue token
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Choose whether the patient sees the doctor first or goes straight to lab, X-ray, surgery, or pharmacy. Then
            enter details and create the token. Phone is optional.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tokenNo" className="flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              Token number (manual)
            </Label>
            <Input
              id="tokenNo"
              type="number"
              min={1}
              value={tokenNumberInput}
              onChange={(e) => setTokenNumberInput(e.target.value)}
              placeholder="Enter token number provided by receptionist"
              className="text-lg"
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
            />
            <p className="text-xs text-slate-500">
              Optional. Leave empty to auto-generate next token number. If entered and already active today, it will be rejected.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Label className="text-slate-800">Visit type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisitFlow('doctor_first')}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  visitFlow === 'doctor_first'
                    ? 'border-primary bg-secondary/70 ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold text-slate-900">Doctor first</span>
                <p className="text-xs text-slate-600 mt-0.5">Usual flow — token for the doctor; referrals added later.</p>
              </button>
              <button
                type="button"
                onClick={() => setVisitFlow('direct')}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  visitFlow === 'direct'
                    ? 'border-primary bg-secondary/70 ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold text-slate-900">Direct to department</span>
                <p className="text-xs text-slate-600 mt-0.5">Walk-in only for lab, X-ray, surgery, or pharmacy — no doctor queue.</p>
              </button>
            </div>
            {visitFlow === 'direct' && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="direct-dept" className="text-sm text-slate-700">
                  Department
                </Label>
                <Select value={directDept} onValueChange={(v) => setDirectDept(v as DirectDept)}>
                  <SelectTrigger id="direct-dept" className="bg-white">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECT_DEPT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer name
            </Label>
            <Input
              id="cust"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="text-lg"
              autoComplete="name"
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
            />
          </div>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="space-y-2">
              <Label htmlFor="pet" className="flex items-center gap-2">
                <PawPrint className="w-4 h-4 text-primary" />
                Pet name
              </Label>
              <Input
                id="pet"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="e.g. Bruno"
                className="text-lg bg-white"
                onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="species" className="text-slate-700">
                Animal type
              </Label>
              <Select
                value={petAnimalType}
                onValueChange={(v) => setPetAnimalType(v as AnimalType)}
              >
                <SelectTrigger id="species" className="h-11 w-full text-lg bg-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RECEPTION_SPECIES_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-base">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {petAnimalType === 'other' && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="custom-species" className="text-sm text-slate-600 font-normal">
                    Custom species
                  </Label>
                  <Input
                    id="custom-species"
                    value={customSpecies}
                    onChange={(e) => setCustomSpecies(e.target.value)}
                    placeholder="e.g. Goat, Rabbit, Hamster, Parrot…"
                    className="bg-white"
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph" className="flex items-center gap-2 text-slate-600">
              <Phone className="w-4 h-4" />
              Phone <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="ph"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional — for records only"
              inputMode="tel"
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
            />
          </div>
          <Button type="button" size="lg" className="w-full text-base h-12" onClick={handleQuickCreate}>
            <Printer className="w-5 h-5 mr-2" />
            Create token &amp; print for customer
          </Button>
        </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 justify-center">
          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" type="button">
                <Search className="w-4 h-4 mr-2" />
                Returning customer — new token
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Find customer</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-500">
                Search by name or phone, then create a token for one of their pets.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Name or phone"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button type="button" onClick={handleSearch}>
                  Search
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <div key={result.patient.id} className="rounded-lg border p-3 space-y-2">
                    <p className="font-medium">{result.patient.owner_name}</p>
                    <p className="text-sm text-slate-500">{result.patient.owner_phone}</p>
                    {result.animals.map((animal: Animal) => (
                      <Button
                        key={animal.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => {
                          issueTokenAndPrint(
                            result.patient.id,
                            animal.id,
                            result.patient.owner_name,
                            animal.name
                          );
                          setSearchOpen(false);
                          setSearchTerm('');
                          setSearchResults([]);
                        }}
                      >
                        <span>Token for {animal.name}</span>
                        <Printer className="w-4 h-4" />
                      </Button>
                    ))}
                  </div>
                ))}
                {searchResults.length === 0 && searchTerm && (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No matches. Try another search.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <aside className="w-full xl:w-96 shrink-0">
        <Card className="xl:sticky xl:top-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Today&apos;s tokens</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={refreshQueue}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {queue.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No tokens yet today.</p>
          ) : (
            <ul className="max-h-[min(70vh,32rem)] overflow-y-auto space-y-1 pr-1 -mr-1">
              {queue.map((row) => (
                <li key={row.id}>
                  <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">#{row.token_number}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {row.entry_kind === 'direct' && (
                          <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-900 border-sky-200">
                            Direct
                          </Badge>
                        )}
                        <Badge className={getStatusBadge(row.status)}>{row.status}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-600 hover:text-slate-900"
                          onClick={() => handleReprint(row)}
                          aria-label={`Reprint token #${row.token_number}`}
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" />
                          Print
                        </Button>
                        {row.status !== 'completed' && row.status !== 'cancelled' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-600 hover:text-red-700"
                            onClick={() => handleCancelToken(row)}
                            aria-label={`Cancel token #${row.token_number}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 truncate mt-0.5">
                      {row.patient_name}
                    </p>
                    <div className="flex items-center justify-between gap-3 mt-0.5">
                      <p className="text-xs text-slate-500 truncate">{row.animal_name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                        <span className="truncate">{row.bill_code}</span>
                        <Printer className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        </Card>
      </aside>
    </div>
  );
}
