import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Printer, Download, PawPrint, User } from 'lucide-react';
import { getAllPatientsWithAnimals, searchPatients } from '@/lib/services/patientService';
import { getBillsByAnimalId, getBillWithDetails } from '@/lib/services/billingService';
import { printPatientRecord, downloadPatientRecordHtml } from '@/lib/printPatientRecord';
import type { Animal, Bill, MedicalRecord, Patient } from '@/types';
import { toast } from 'sonner';

function formatWhen(iso: unknown): string {
  if (iso == null) return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PatientRecordsModule() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { patient: Patient; animals: Animal[]; last_visit?: string }[]
  >(() => getAllPatientsWithAnimals());
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);

  const detail = useMemo(() => {
    if (selectedBillId == null) return null;
    return getBillWithDetails(selectedBillId);
  }, [selectedBillId]);

  const sortedMedicalRecords = useMemo((): MedicalRecord[] => {
    const rows = detail?.medicalRecords;
    if (!rows?.length) return [];
    return [...rows].sort((a, b) => Number(b.id) - Number(a.id));
  }, [detail?.medicalRecords]);

  const handleSearch = () => {
    const q = query.trim();
    if (q.length === 0) {
      const all = getAllPatientsWithAnimals();
      setResults(all);
      setSelectedPatient(null);
      setSelectedAnimal(null);
      setBills([]);
      setSelectedBillId(null);
      if (all.length === 0) toast.info('No patients on file yet');
      return;
    }
    if (q.length < 2) {
      toast.error('Type at least 2 characters, or clear the box and press Search to list everyone');
      return;
    }
    const r = searchPatients(q);
    setResults(r);
    setSelectedPatient(null);
    setSelectedAnimal(null);
    setBills([]);
    setSelectedBillId(null);
    if (r.length === 0) toast.info('No patients matched');
  };

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setSelectedAnimal(null);
    setBills([]);
    setSelectedBillId(null);
  };

  const selectAnimal = (a: Animal) => {
    setSelectedAnimal(a);
    setBills(getBillsByAnimalId(a.id));
    setSelectedBillId(null);
  };

  const openBill = (billId: number) => {
    setSelectedBillId(billId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5" />
            Patient records
          </CardTitle>
          <p className="text-sm text-slate-600">
            All owners are listed below. Narrow with search (name or phone), open a pet, then a visit to view the full
            clinical record, print, or download. Clear the search box and press Search to show everyone again.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Filter by name or phone (optional)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-md"
            />
            <Button type="button" onClick={handleSearch}>
              <Search className="w-4 h-4 mr-2" />
              Search / show all
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Matching owners</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[min(60vh,24rem)] overflow-y-auto">
              {results.map((row) => {
                const active = selectedPatient?.id === row.patient.id;
                return (
                  <button
                    key={row.patient.id}
                    type="button"
                    onClick={() => selectPatient(row.patient)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      active ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{row.patient.owner_name}</p>
                    <p className="text-xs text-slate-500">{row.patient.owner_phone}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PawPrint className="w-4 h-4" />
                Pets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {!selectedPatient ? (
                <p className="text-sm text-slate-500 py-6">Select an owner first.</p>
              ) : (
                (() => {
                  const row = results.find((r) => r.patient.id === selectedPatient.id);
                  const animals = row?.animals ?? [];
                  if (animals.length === 0) {
                    return <p className="text-sm text-slate-500">No animals on file.</p>;
                  }
                  return animals.map((a) => {
                    const active = selectedAnimal?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectAnimal(a)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-medium">{a.name}</span>
                        <span className="text-slate-600"> — {a.type}</span>
                      </button>
                    );
                  });
                })()
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Visits (bills)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[min(60vh,24rem)] overflow-y-auto">
              {!selectedAnimal ? (
                <p className="text-sm text-slate-500 py-6">Select a pet to list visits.</p>
              ) : bills.length === 0 ? (
                <p className="text-sm text-slate-500">No bills for this pet yet.</p>
              ) : (
                bills.map((b) => {
                  const active = selectedBillId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openBill(b.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        active ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{b.bill_code}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {b.payment_status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{formatWhen(b.created_at)}</p>
                      <p className="text-xs text-slate-700 mt-0.5">
                        Rs. {Number(b.final_amount || 0).toLocaleString('en-IN')}
                      </p>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-8">No patients registered yet.</p>
      )}

      {detail && selectedBillId != null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-5 h-5" />
                Visit detail — {detail.bill.bill_code}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {detail.patient?.owner_name} · {detail.animal?.name} ({detail.animal?.type}) · Token #
                {detail.token?.token_number ?? '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const ok = printPatientRecord(selectedBillId);
                  if (!ok)
                    toast.error(
                      'Could not open the print window. Allow pop-ups for this site, then try again.'
                    );
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print record
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const ok = downloadPatientRecordHtml(selectedBillId);
                  if (!ok) toast.error('Could not build file');
                  else toast.success('Download started');
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download HTML
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {sortedMedicalRecords.length === 0 ? (
              <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-6 text-center">
                No clinical record saved for this visit yet.
              </p>
            ) : (
              <div className="space-y-8">
                {sortedMedicalRecords.map((mr, idx) => (
                  <div key={mr.id} className="space-y-4">
                    {sortedMedicalRecords.length > 1 && (
                      <div className="rounded-md bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-800">
                        <span className="font-semibold">
                          Record {idx + 1} of {sortedMedicalRecords.length}
                        </span>
                        {mr.created_at && (
                          <span className="text-slate-600"> · Saved {formatWhen(mr.created_at)}</span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                        <h3 className="font-semibold text-slate-900">General</h3>
                        <Field label="Symptoms" value={mr.symptoms} />
                        <Field label="Diagnosis" value={mr.diagnosis} />
                        <Field label="Treatment" value={mr.treatment} />
                        <Field label="Notes" value={mr.notes} />
                        <Field label="Follow-up" value={mr.follow_up_date} />
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                        <h3 className="font-semibold text-slate-900">Laboratory</h3>
                        <Field label="Lab notes" value={mr.laboratory_notes} />
                        <Field label="Doctor after lab" value={mr.laboratory_examination} />
                        <Label className="text-slate-600">Images</Label>
                        <XrayThumbs raw={mr.laboratory_images} />
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4 space-y-2 md:col-span-2">
                        <h3 className="font-semibold text-slate-900">X-Ray</h3>
                        <Field label="Operator notes" value={mr.xray_notes} />
                        <Field label="Doctor report" value={mr.xray_examination} />
                        <Label className="text-slate-600">Images</Label>
                        <XrayThumbs raw={mr.xray_images} />
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4 space-y-2 md:col-span-2">
                        <h3 className="font-semibold text-slate-900">Surgery</h3>
                        <Field label="Room notes" value={mr.surgery_notes} />
                        <Field label="Doctor surgical summary" value={mr.surgery_examination} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Bill items</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left p-2">Item</th>
                      <th className="text-left p-2">Room</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-slate-500 text-center">
                          No line items
                        </td>
                      </tr>
                    ) : (
                      detail.items.map((it: any) => (
                        <tr key={it.id} className="border-b border-slate-100">
                          <td className="p-2">{it.item_name}</td>
                          <td className="p-2 text-slate-600">{it.room_name}</td>
                          <td className="p-2 text-right">{it.quantity}</td>
                          <td className="p-2 text-right">Rs. {Number(it.total_price).toLocaleString('en-IN')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  const t = String(value ?? '').trim();
  if (!t) return null;
  return (
    <div>
      <span className="text-xs uppercase text-slate-500">{label}</span>
      <p className="whitespace-pre-wrap text-slate-900">{t}</p>
    </div>
  );
}

function XrayThumbs({ raw }: { raw?: string | null }) {
  let urls: string[] = [];
  try {
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) urls = p.filter((x) => typeof x === 'string');
    }
  } catch {
    /* ignore */
  }
  if (urls.length === 0) {
    return <p className="text-sm text-slate-500">No images attached</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((src, i) => (
        <a
          key={i}
          href={src}
          target="_blank"
          rel="noreferrer"
          className="block w-28 h-28 border rounded overflow-hidden bg-slate-100 shrink-0"
        >
          <img src={src} alt="" className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  );
}
