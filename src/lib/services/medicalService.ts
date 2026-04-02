import { query, getOne, run } from '../database';
import type { MedicalRecord } from '@/types';

// Create medical record
export function createMedicalRecord(data: Omit<MedicalRecord, 'id' | 'created_at'>): MedicalRecord {
  const result = run(
    `INSERT INTO medical_records 
     (bill_id, patient_id, animal_id, doctor_id, doctor_name, room_id, diagnosis, symptoms, treatment, notes, follow_up_date) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    'SELECT * FROM medical_records WHERE bill_id = ? ORDER BY created_at DESC',
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
  const records = query(
    `SELECT mr.*, b.bill_code, b.created_at as visit_date
     FROM medical_records mr
     JOIN bills b ON mr.bill_id = b.id
     WHERE mr.animal_id = ?
     ORDER BY mr.created_at DESC`,
    [animalId]
  );
  
  return records.map(record => ({
    ...record,
    bill_items: query('SELECT * FROM bill_items WHERE bill_id = ?', [record.bill_id]),
  }));
}

// Get today's medical records for a doctor
export function getTodayMedicalRecords(doctorId?: number): MedicalRecord[] {
  const today = new Date().toISOString().split('T')[0];
  
  if (doctorId) {
    return query(
      `SELECT * FROM medical_records 
       WHERE doctor_id = ? AND DATE(created_at) = ?
       ORDER BY created_at DESC`,
      [doctorId, today]
    ) as MedicalRecord[];
  }
  
  return query(
    `SELECT * FROM medical_records 
     WHERE DATE(created_at) = ?
     ORDER BY created_at DESC`,
    [today]
  ) as MedicalRecord[];
}

// Get follow-up appointments
export function getFollowUps(date?: string): any[] {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  return query(
    `SELECT mr.*, p.owner_name, p.owner_phone, a.name as animal_name, a.type as animal_type
     FROM medical_records mr
     JOIN patients p ON mr.patient_id = p.id
     JOIN animals a ON mr.animal_id = a.id
     WHERE mr.follow_up_date = ?
     ORDER BY mr.created_at DESC`,
    [targetDate]
  );
}
