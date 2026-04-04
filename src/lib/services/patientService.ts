import { query, getOne, run } from '../database';
import type { Patient, Animal, PatientFormData, PatientSearchResult, AnimalType } from '@/types';

export type WalkInPatientOpts = {
  phone?: string;
  animalType?: AnimalType;
  /** When animalType is `other`, stored in notes and used on token slip */
  customSpecies?: string;
};

// Create new patient with animal
export function createPatient(data: PatientFormData): { patient: Patient; animal: Animal } {
  const ts = new Date().toISOString();
  // Create patient
  const patientResult = run(
    'INSERT INTO patients (owner_name, owner_phone, owner_email, owner_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      data.owner_name,
      data.owner_phone,
      data.owner_email || null,
      data.owner_address || null,
      ts,
      ts,
    ]
  );

  const patientId = patientResult.lastInsertRowid;

  // Create animal
  const animalResult = run(
    'INSERT INTO animals (patient_id, name, type, breed, age, age_unit, gender, weight, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      patientId,
      data.animal_name,
      data.animal_type,
      data.breed || null,
      data.age || null,
      data.age_unit || null,
      data.gender || null,
      data.weight || null,
      data.notes || null,
      ts,
    ]
  );
  
  const patient = getOne('SELECT * FROM patients WHERE id = ?', [patientId]) as Patient;
  const animal = getOne('SELECT * FROM animals WHERE id = ?', [animalResult.lastInsertRowid]) as Animal;
  
  return { patient, animal };
}

/** Minimal registration for reception: customer name + pet name; phone optional (use "—" if empty). */
export function createWalkInPatient(
  customerName: string,
  petName: string,
  opts?: WalkInPatientOpts
): { patient: Patient; animal: Animal } {
  const trimmedOwner = customerName.trim();
  const trimmedPet = petName.trim();
  const ph = opts?.phone?.trim();
  const animalType = opts?.animalType ?? 'dog';
  const custom = opts?.customSpecies?.trim() ?? '';
  const notes =
    animalType === 'other' && custom.length > 0
      ? `Species: ${custom}`
      : '';

  const data: PatientFormData = {
    owner_name: trimmedOwner,
    owner_phone: ph && ph.length > 0 ? ph : '—',
    owner_email: '',
    owner_address: '',
    animal_name: trimmedPet,
    animal_type: animalType,
    breed: '',
    age: undefined,
    age_unit: 'years',
    gender: 'unknown',
    weight: undefined,
    notes,
  };
  return createPatient(data);
}

// Get patient by ID
export function getPatientById(id: number): Patient | null {
  return getOne('SELECT * FROM patients WHERE id = ?', [id]) as Patient | null;
}

// Get animal by ID
export function getAnimalById(id: number): Animal | null {
  return getOne('SELECT * FROM animals WHERE id = ?', [id]) as Animal | null;
}

// Get animals by patient ID
export function getAnimalsByPatientId(patientId: number): Animal[] {
  return query('SELECT * FROM animals WHERE patient_id = ? ORDER BY created_at DESC', [patientId]) as Animal[];
}

// Search patients by owner name or phone
export function searchPatients(searchTerm: string): PatientSearchResult[] {
  const patients = query(
    'SELECT * FROM patients WHERE owner_name LIKE ? OR owner_phone LIKE ? ORDER BY updated_at DESC LIMIT 20',
    [`%${searchTerm}%`, `%${searchTerm}%`]
  ) as Patient[];
  
  return patients.map(patient => {
    const animals = getAnimalsByPatientId(patient.id);
    const lastVisit = getOne(
      'SELECT MAX(created_at) as last_visit FROM bills WHERE patient_id = ?',
      [patient.id]
    );
    
    return {
      patient,
      animals,
      last_visit: lastVisit?.last_visit,
    };
  });
}

// Get patient full details
export function getPatientFullDetails(patientId: number): PatientSearchResult | null {
  const patient = getPatientById(patientId);
  if (!patient) return null;
  
  const animals = getAnimalsByPatientId(patientId);
  const lastVisit = getOne(
    'SELECT MAX(created_at) as last_visit FROM bills WHERE patient_id = ?',
    [patientId]
  );
  
  return {
    patient,
    animals,
    last_visit: lastVisit?.last_visit,
  };
}

// Update patient
export function updatePatient(id: number, data: Partial<Patient>): Patient | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (data.owner_name) {
    sets.push('owner_name = ?');
    values.push(data.owner_name);
  }
  if (data.owner_phone) {
    sets.push('owner_phone = ?');
    values.push(data.owner_phone);
  }
  if (data.owner_email !== undefined) {
    sets.push('owner_email = ?');
    values.push(data.owner_email);
  }
  if (data.owner_address !== undefined) {
    sets.push('owner_address = ?');
    values.push(data.owner_address);
  }
  
  if (sets.length === 0) return getPatientById(id);
  
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  run(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, values);
  return getPatientById(id);
}

// Update animal
export function updateAnimal(id: number, data: Partial<Animal>): Animal | null {
  const sets: string[] = [];
  const values: any[] = [];
  
  if (data.name) {
    sets.push('name = ?');
    values.push(data.name);
  }
  if (data.type) {
    sets.push('type = ?');
    values.push(data.type);
  }
  if (data.breed !== undefined) {
    sets.push('breed = ?');
    values.push(data.breed);
  }
  if (data.age !== undefined) {
    sets.push('age = ?');
    values.push(data.age);
  }
  if (data.age_unit !== undefined) {
    sets.push('age_unit = ?');
    values.push(data.age_unit);
  }
  if (data.gender !== undefined) {
    sets.push('gender = ?');
    values.push(data.gender);
  }
  if (data.weight !== undefined) {
    sets.push('weight = ?');
    values.push(data.weight);
  }
  if (data.notes !== undefined) {
    sets.push('notes = ?');
    values.push(data.notes);
  }
  
  if (sets.length === 0) return getAnimalById(id);
  
  values.push(id);
  run(`UPDATE animals SET ${sets.join(', ')} WHERE id = ?`, values);
  return getAnimalById(id);
}

// Add animal to existing patient
export function addAnimal(patientId: number, data: Omit<Animal, 'id' | 'patient_id' | 'created_at'>): Animal {
  const result = run(
    'INSERT INTO animals (patient_id, name, type, breed, age, age_unit, gender, weight, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      patientId,
      data.name,
      data.type,
      data.breed || null,
      data.age || null,
      data.age_unit || null,
      data.gender || null,
      data.weight || null,
      data.notes || null,
    ]
  );
  
  return getAnimalById(result.lastInsertRowid) as Animal;
}

// Get patient visit history
export function getPatientVisitHistory(patientId: number) {
  const bills = query(
    `SELECT b.*, a.name as animal_name, a.type as animal_type
     FROM bills b
     JOIN animals a ON b.animal_id = a.id
     WHERE b.patient_id = ?
     ORDER BY b.created_at DESC`,
    [patientId]
  );
  
  return bills.map(bill => ({
    ...bill,
    items: query('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]),
    medical_records: query(
      'SELECT * FROM medical_records WHERE bill_id = ?',
      [bill.id]
    ),
  }));
}

// Get all patients (paginated)
export function getAllPatients(page: number = 1, limit: number = 20): { patients: Patient[]; total: number } {
  const offset = (page - 1) * limit;
  const patients = query(
    'SELECT * FROM patients ORDER BY updated_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  ) as Patient[];
  
  const count = getOne('SELECT COUNT(*) as total FROM patients') as { total: number };
  
  return { patients, total: count.total };
}
