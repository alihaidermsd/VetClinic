import { query, getOne, run, listTable } from '../database';
import { getPatientById, getAnimalById } from './patientService';
import type { MedicalRecord } from '@/types';

function datePart(iso: string | undefined | null): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.split('T')[0] ?? null;
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
    });
    if (updated) return updated;
    throw new Error('Failed to update medical record');
  }
  return createMedicalRecord(data);
}

// Create medical record
export function createMedicalRecord(data: Omit<MedicalRecord, 'id' | 'created_at'>): MedicalRecord {
  const ts = new Date().toISOString();
  // Single-line INSERT so paramsToObject maps columns to params reliably.
  const result = run(
    'INSERT INTO medical_records (bill_id, patient_id, animal_id, doctor_id, doctor_name, room_id, diagnosis, symptoms, treatment, notes, follow_up_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      ts,
    ]
  );

  return getOne('SELECT * FROM medical_records WHERE id = ?', [result.lastInsertRowid]) as MedicalRecord;
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
  
  if (updates.diagnosis !== undefined) {
    sets.push('diagnosis = ?');
    values.push(updates.diagnosis);
  }
  if (updates.symptoms !== undefined) {
    sets.push('symptoms = ?');
    values.push(updates.symptoms);
  }
  if (updates.treatment !== undefined) {
    sets.push('treatment = ?');
    values.push(updates.treatment);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.follow_up_date !== undefined) {
    sets.push('follow_up_date = ?');
    values.push(updates.follow_up_date);
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
