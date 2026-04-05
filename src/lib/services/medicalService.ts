import { query, getOne, run, listTable } from '../database';
import { getPatientById, getAnimalById } from './patientService';
import { getBillById } from './billingService';
import type { MedicalRecord } from '@/types';

function datePart(iso: string | undefined | null): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.split('T')[0] ?? null;
}

const MR_INSERT_COLS =
  'bill_id, patient_id, animal_id, doctor_id, doctor_name, room_id, diagnosis, symptoms, treatment, notes, follow_up_date, laboratory_notes, laboratory_examination, xray_notes, xray_examination, xray_images, surgery_notes, surgery_examination, created_at';

function normalizeXrayImages(raw: unknown): string {
  if (raw == null || raw === '') return '[]';
  const s = String(raw).trim();
  if (s.startsWith('[')) return s;
  return '[]';
}

/** One logical note per bill: update latest row if present, else insert (avoids duplicate rows on every Save). */
export function saveMedicalRecordForBill(
  data: Omit<MedicalRecord, 'id' | 'created_at'>
): MedicalRecord {
  const existing = getMedicalRecordsByBillId(data.bill_id);
  if (existing.length > 0) {
    const latest = existing[0];
    const updated = updateMedicalRecord(latest.id, {
      diagnosis: data.diagnosis,
      symptoms: data.symptoms,
      treatment: data.treatment,
      notes: data.notes,
      follow_up_date: data.follow_up_date,
      laboratory_notes: data.laboratory_notes,
      laboratory_examination: data.laboratory_examination,
      xray_notes: data.xray_notes,
      xray_examination: data.xray_examination,
      xray_images: data.xray_images != null ? normalizeXrayImages(data.xray_images) : undefined,
      surgery_notes: data.surgery_notes,
      surgery_examination: data.surgery_examination,
    });
    if (updated) return updated;
    throw new Error('Failed to update medical record');
  }
  return createMedicalRecord(data);
}

// Create medical record
export function createMedicalRecord(data: Omit<MedicalRecord, 'id' | 'created_at'>): MedicalRecord {
  const ts = new Date().toISOString();
  const result = run(
    `INSERT INTO medical_records (${MR_INSERT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.bill_id,
      data.patient_id,
      data.animal_id,
      data.doctor_id,
      data.doctor_name,
      data.room_id,
      data.diagnosis || null,
      data.symptoms || null,
      data.treatment || null,
      data.notes || null,
      data.follow_up_date || null,
      data.laboratory_notes ?? null,
      data.laboratory_examination ?? null,
      data.xray_notes ?? null,
      data.xray_examination ?? null,
      normalizeXrayImages(data.xray_images),
      data.surgery_notes ?? null,
      data.surgery_examination ?? null,
      ts,
    ]
  );

  return getOne('SELECT * FROM medical_records WHERE id = ?', [result.lastInsertRowid]) as MedicalRecord;
}

/** Lab / X-ray / surgery operators: merge notes onto the bill's medical record (creates stub row if needed). */
export function upsertMedicalRecordFields(
  billId: number,
  user: { id: number; name: string },
  roomId: number,
  patch: Partial<
    Pick<
      MedicalRecord,
      | 'laboratory_notes'
      | 'laboratory_examination'
      | 'xray_notes'
      | 'xray_examination'
      | 'xray_images'
      | 'surgery_notes'
      | 'surgery_examination'
    >
  >
): MedicalRecord {
  const bill = getBillById(billId);
  if (!bill) throw new Error('Bill not found');

  const existing = getMedicalRecordsByBillId(billId);
  if (existing.length > 0) {
    const latest = existing[0];
    const next: Parameters<typeof updateMedicalRecord>[1] = { ...patch };
    if (patch.xray_images !== undefined) {
      next.xray_images = normalizeXrayImages(patch.xray_images);
    }
    const updated = updateMedicalRecord(latest.id, next);
    if (updated) return updated;
    throw new Error('Failed to update medical record');
  }

  return createMedicalRecord({
    bill_id: billId,
    patient_id: bill.patient_id,
    animal_id: bill.animal_id,
    doctor_id: user.id,
    doctor_name: user.name,
    room_id: roomId,
    diagnosis: '',
    symptoms: '',
    treatment: '',
    notes: '',
    follow_up_date: null,
    laboratory_notes: patch.laboratory_notes ?? null,
    laboratory_examination: patch.laboratory_examination ?? null,
    xray_notes: patch.xray_notes ?? null,
    xray_examination: patch.xray_examination ?? null,
    xray_images: patch.xray_images != null ? normalizeXrayImages(patch.xray_images) : '[]',
    surgery_notes: patch.surgery_notes ?? null,
    surgery_examination: patch.surgery_examination ?? null,
  });
}

// Get medical record by ID
export function getMedicalRecordById(id: number): MedicalRecord | null {
  return getOne('SELECT * FROM medical_records WHERE id = ?', [id]) as MedicalRecord | null;
}

// Get medical records by bill ID
export function getMedicalRecordsByBillId(billId: number): MedicalRecord[] {
  return query(
    'SELECT * FROM medical_records WHERE bill_id = ? ORDER BY id DESC',
    [billId]
  ) as MedicalRecord[];
}

// Get medical records by patient ID
export function getMedicalRecordsByPatientId(patientId: number): MedicalRecord[] {
  return query(
    'SELECT * FROM medical_records WHERE patient_id = ? ORDER BY created_at DESC',
    [patientId]
  ) as MedicalRecord[];
}

// Get medical records by animal ID
export function getMedicalRecordsByAnimalId(animalId: number): MedicalRecord[] {
  return query(
    'SELECT * FROM medical_records WHERE animal_id = ? ORDER BY created_at DESC',
    [animalId]
  ) as MedicalRecord[];
}

// Update medical record
export function updateMedicalRecord(id: number, updates: Partial<MedicalRecord>): MedicalRecord | null {
  const sets: string[] = [];
  const values: any[] = [];

  const stringFields: (keyof MedicalRecord)[] = [
    'diagnosis',
    'symptoms',
    'treatment',
    'notes',
    'follow_up_date',
    'laboratory_notes',
    'laboratory_examination',
    'xray_notes',
    'xray_examination',
    'xray_images',
    'surgery_notes',
    'surgery_examination',
  ];

  for (const key of stringFields) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (sets.length === 0) return getMedicalRecordById(id);

  values.push(id);
  run(`UPDATE medical_records SET ${sets.join(', ')} WHERE id = ?`, values);

  return getMedicalRecordById(id);
}

// Delete medical record
export function deleteMedicalRecord(id: number): boolean {
  const result = run('DELETE FROM medical_records WHERE id = ?', [id]);
  return result.changes > 0;
}

// Get full medical history for an animal
export function getAnimalMedicalHistory(animalId: number) {
  const billsById = Object.fromEntries((listTable('bills') as any[]).map((b) => [b.id, b]));
  const records = (listTable('medical_records') as MedicalRecord[])
    .filter((mr) => mr.animal_id === animalId)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return records.map((record) => {
    const b = billsById[record.bill_id];
    return {
      ...record,
      bill_code: b?.bill_code,
      visit_date: b?.created_at,
      bill_items: query('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY created_at DESC', [
        record.bill_id,
      ]),
    };
  });
}

// Get today's medical records for a doctor
export function getTodayMedicalRecords(doctorId?: number): MedicalRecord[] {
  const today = new Date().toISOString().split('T')[0];
  let rows = listTable('medical_records') as MedicalRecord[];
  rows = rows.filter((mr) => datePart(mr.created_at) === today);
  if (doctorId != null) {
    rows = rows.filter((mr) => mr.doctor_id === doctorId);
  }
  return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// Get follow-up appointments
export function getFollowUps(date?: string): any[] {
  const targetDate = date || new Date().toISOString().split('T')[0];

  return (listTable('medical_records') as MedicalRecord[])
    .filter((mr) => mr.follow_up_date === targetDate)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((mr) => {
      const p = getPatientById(mr.patient_id);
      const a = getAnimalById(mr.animal_id);
      return {
        ...mr,
        owner_name: p?.owner_name,
        owner_phone: p?.owner_phone,
        animal_name: a?.name,
        animal_type: a?.type,
      };
    });
}
