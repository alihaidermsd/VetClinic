import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Ticket, Printer, Search, RefreshCw, User, Phone, PawPrint } from 'lucide-react';
import { createWalkInPatient, searchPatients } from '@/lib/services/patientService';
import { createToken, getTodayTokensForReception, type ReceptionTokenRow } from '@/lib/services/tokenService';
import { getBillById } from '@/lib/services/billingService';
import { printTokenSlip } from '@/lib/printToken';
import type { Animal } from '@/types';
import { toast } from 'sonner';

export function ReceptionModule() {
  const [customerName, setCustomerName] = useState('');
  const [petName, setPetName] = useState('');
  const [phone, setPhone] = useState('');

  const [queue, setQueue] = useState<ReceptionTokenRow[]>([]);
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

  const issueTokenAndPrint = (
    patientId: number,
    animalId: number,
    displayCustomer: string,
    displayPet: string
  ) => {
    const token = createToken(patientId, animalId);
    const bill = getBillById(token.bill_id);
    const billCode = bill?.bill_code ?? '—';

    const printed = printTokenSlip({
      tokenNumber: token.token_number,
      customerName: displayCustomer,
      petName: displayPet,
      billCode,
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
    try {
      const { patient, animal } = createWalkInPatient(c, p, phone);
      issueTokenAndPrint(patient.id, animal.id, c, p);
      setCustomerName('');
      setPetName('');
      setPhone('');
    } catch (e) {
      console.error(e);
      toast.error('Could not create token. Try again.');
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-6xl mx-auto p-4 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <Card className="border-2 border-blue-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Ticket className="w-6 h-6 text-blue-600" />
            New queue token
          </CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Enter the customer and pet name, then press the button. A printable token opens for the customer.
            Phone is optional.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="pet" className="flex items-center gap-2">
              <PawPrint className="w-4 h-4" />
              Pet name
            </Label>
            <Input
              id="pet"
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              placeholder="e.g. Bruno"
              className="text-lg"
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
            />
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
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2.5 transition-colors"
                    onClick={() => handleReprint(row)}
                    aria-label={`Reprint token #${row.token_number}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">#{row.token_number}</span>
                      <Badge className={getStatusBadge(row.status)}>{row.status}</Badge>
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
                  </button>
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
