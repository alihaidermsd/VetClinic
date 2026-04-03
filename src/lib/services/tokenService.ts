import { getOne, run, listTable } from '../database';
import type { Token, TokenStatus, RoomQueueItem } from '@/types';

/** Calendar day in the clinic's browser timezone (YYYY-MM-DD). */
export function getClinicDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Token row counts as "today" if its date matches local clinic day OR UTC day (legacy data / timezone). */
export function isTokenFromToday(token: { date?: string } | null | undefined): boolean {
  if (token == null) return false;

  const clinicToday = getClinicDateString();
  const utcToday = utcDateString();

  const raw = String(token.date ?? '').trim();
  if (!raw) return false;

  // If stored as ISO timestamp, remove time portion.
  const beforeTime = raw.split('T')[0].split(' ')[0].trim();

  // Normalize YYYYMMDD -> YYYY-MM-DD
  if (/^\d{8}$/.test(beforeTime)) {
    const y = beforeTime.slice(0, 4);
    const m = beforeTime.slice(4, 6);
    const d = beforeTime.slice(6, 8);
    const ymd = `${y}-${m}-${d}`;
    return ymd === clinicToday || ymd === utcToday;
  }

  // Normalize YYYY/M/D or YYYY-MM-D -> YYYY-MM-DD
  const mdy = beforeTime.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (mdy) {
    const y = mdy[1];
    const m = String(mdy[2]).padStart(2, '0');
    const d = String(mdy[3]).padStart(2, '0');
    const ymd = `${y}-${m}-${d}`;
    return ymd === clinicToday || ymd === utcToday;
  }

  // If it looks like YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(beforeTime)) {
    return beforeTime === clinicToday || beforeTime === utcToday;
  }

  // Last resort: if it's epoch millis or any parseable date string, compare by local/UTC date parts.
  if (/^\d+$/.test(raw)) {
    const dt = new Date(Number(raw));
    if (!Number.isNaN(dt.getTime())) {
      const ymdLocal = getClinicDateStringFromDate(dt);
      const ymdUtc = getUTCDateStringFromDate(dt);
      return ymdLocal === clinicToday || ymdUtc === utcToday;
    }
  } else {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      const ymdLocal = getClinicDateStringFromDate(dt);
      const ymdUtc = getUTCDateStringFromDate(dt);
      return ymdLocal === clinicToday || ymdUtc === utcToday;
    }
  }

  return false;
}

function getCurrentDate(): string {
  return getClinicDateString();
}

function getClinicDateStringFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getUTCDateStringFromDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Generate next token number for today
export function generateTokenNumber(): number {
  const nums = (listTable('tokens') as Token[])
    .filter((t) => isTokenFromToday(t))
    .map((t) => Number(t.token_number) || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

// Generate bill code
export function generateBillCode(): string {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const lastBill = getOne(
    'SELECT MAX(id) as last_id FROM bills'
  );
  
  const nextId = (lastBill?.last_id || 0) + 1;
  return `BILL-${dateStr}-${String(nextId).padStart(4, '0')}`;
}

// Create new token
export function createToken(patientId: number, animalId: number): Token {
  const tokenNumber = generateTokenNumber();
  const billCode = generateBillCode();
  const ts = new Date().toISOString();
  const today = getCurrentDate();

  // First create the token
  const tokenResult = run(
    'INSERT INTO tokens (token_number, bill_id, patient_id, animal_id, status, date, created_at) VALUES (?, 0, ?, ?, ?, ?, ?)',
    [tokenNumber, patientId, animalId, 'waiting', today, ts]
  );

  const tokenId = tokenResult.lastInsertRowid;

  // Then create the bill with the token ID
  const billResult = run(
    'INSERT INTO bills (bill_code, patient_id, animal_id, token_id, total_amount, discount_amount, discount_percent, final_amount, paid_amount, payment_status, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?, ?)',
    [billCode, patientId, animalId, tokenId, 'pending', 'active', ts, ts]
  );
  
  // Update token with bill_id
  run('UPDATE tokens SET bill_id = ? WHERE id = ?', [billResult.lastInsertRowid, tokenId]);
  
  return getTokenById(tokenId) as Token;
}

// Get token by ID
export function getTokenById(id: number): Token | null {
  return getOne('SELECT * FROM tokens WHERE id = ?', [id]) as Token | null;
}

// Get token by token number (today only — local + UTC day, numeric-safe)
export function getTokenByNumber(tokenNumber: number): Token | null {
  const n = Number(tokenNumber);
  const matches = (listTable('tokens') as Token[]).filter(
    (t) => isTokenFromToday(t) && Number(t.token_number) === n
  );
  return matches[0] ?? null;
}

// Get today's tokens (in-memory DB — filter in JS)
export function getTodayTokens(): Token[] {
  return (listTable('tokens') as Token[])
    .filter((t) => isTokenFromToday(t))
    .sort((a, b) => b.token_number - a.token_number);
}

export type TodayTokenDashboardRow = Token & { patient_name: string; animal_name: string };

/** Today's tokens with owner and animal names for the dashboard table. */
export function getTodayTokensForDashboard(): TodayTokenDashboardRow[] {
  const tokens = getTodayTokens();
  const patients = Object.fromEntries(
    listTable('patients').map((p: { id: number; owner_name?: string }) => [p.id, p])
  );
  const animals = Object.fromEntries(
    listTable('animals').map((a: { id: number; name?: string }) => [a.id, a])
  );
  return tokens.map((t) => ({
    ...t,
    patient_name: patients[t.patient_id]?.owner_name ?? '—',
    animal_name: animals[t.animal_id]?.name ?? '—',
  }));
}

export type ReceptionTokenRow = TodayTokenDashboardRow & { bill_code: string };

/** Today's tokens with names and bill code — for reception list and printing. */
export function getTodayTokensForReception(): ReceptionTokenRow[] {
  const base = getTodayTokensForDashboard();
  const billsById = Object.fromEntries(
    listTable('bills').map((b: { id: number; bill_code: string }) => [b.id, b])
  );
  return base.map((t) => ({
    ...t,
    bill_code: billsById[t.bill_id]?.bill_code ?? '—',
  }));
}

// Update token status
export function updateTokenStatus(id: number, status: TokenStatus, roomId?: number): Token | null {
  const updates: string[] = ['status = ?'];
  const values: any[] = [status];
  
  if (roomId !== undefined) {
    updates.push('room_id = ?');
    values.push(roomId);
  }
  
  if (status === 'completed') {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }
  
  values.push(id);
  run(`UPDATE tokens SET ${updates.join(', ')} WHERE id = ?`, values);
  
  return getTokenById(id);
}

// Get token with full details
export function getTokenWithDetails(tokenId: number) {
  const token = getTokenById(tokenId);
  if (!token) return null;
  
  const patient = getOne('SELECT * FROM patients WHERE id = ?', [token.patient_id]);
  const animal = getOne('SELECT * FROM animals WHERE id = ?', [token.animal_id]);
  const bill = getOne('SELECT * FROM bills WHERE id = ?', [token.bill_id]);
  const room = token.room_id ? getOne('SELECT * FROM rooms WHERE id = ?', [token.room_id]) : null;
  
  return {
    token,
    patient,
    animal,
    bill,
    room,
  };
}

// Get room queue
export function getRoomQueue(roomId: number): RoomQueueItem[] {
  const patients = Object.fromEntries(
    listTable('patients').map((p: { id: number; owner_name?: string; owner_phone?: string }) => [
      p.id,
      p,
    ])
  );
  const animals = Object.fromEntries(
    listTable('animals').map((a: { id: number; name?: string; type?: string }) => [a.id, a])
  );

  return (listTable('tokens') as Token[])
    .filter(
      (t) =>
        t.room_id === roomId &&
        isTokenFromToday(t) &&
        (t.status === 'waiting' || t.status === 'in_progress')
    )
    .sort((a, b) => a.token_number - b.token_number)
    .map((t) => ({
      token_id: t.id,
      token_number: t.token_number,
      bill_id: t.bill_id,
      patient_name: patients[t.patient_id]?.owner_name ?? '—',
      owner_phone: patients[t.patient_id]?.owner_phone ?? '—',
      animal_name: animals[t.animal_id]?.name ?? '—',
      animal_type: String(animals[t.animal_id]?.type ?? ''),
      status: t.status,
      waiting_since: t.created_at,
    }));
}

// Get waiting tokens for a room type
export function getWaitingTokensByRoomType(roomType: string): RoomQueueItem[] {
  const roomsById = Object.fromEntries(
    listTable('rooms').map((r: { id: number; type: string }) => [r.id, r])
  );
  const patients = Object.fromEntries(
    listTable('patients').map((p: { id: number; owner_name?: string; owner_phone?: string }) => [
      p.id,
      p,
    ])
  );
  const animals = Object.fromEntries(
    listTable('animals').map((a: { id: number; name?: string; type?: string }) => [a.id, a])
  );

  return (listTable('tokens') as Token[])
    .filter((t) => {
      if (!t.room_id || !isTokenFromToday(t)) return false;
      if (t.status !== 'waiting' && t.status !== 'in_progress') return false;
      const room = roomsById[t.room_id];
      return room?.type === roomType;
    })
    .sort((a, b) => a.token_number - b.token_number)
    .map((t) => ({
      token_id: t.id,
      token_number: t.token_number,
      bill_id: t.bill_id,
      patient_name: patients[t.patient_id]?.owner_name ?? '—',
      owner_phone: patients[t.patient_id]?.owner_phone ?? '—',
      animal_name: animals[t.animal_id]?.name ?? '—',
      animal_type: String(animals[t.animal_id]?.type ?? ''),
      status: t.status,
      waiting_since: t.created_at,
    }));
}

// Assign token to room
export function assignTokenToRoom(tokenId: number, roomId: number): Token | null {
  run('UPDATE tokens SET room_id = ?, status = ? WHERE id = ?', [roomId, 'waiting', tokenId]);
  
  // Also update bill's current room
  const token = getTokenById(tokenId);
  if (token) {
    run('UPDATE bills SET current_room_id = ? WHERE id = ?', [roomId, token.bill_id]);
  }
  
  return getTokenById(tokenId);
}

// Start token (mark as in_progress)
export function startToken(tokenId: number): Token | null {
  return updateTokenStatus(tokenId, 'in_progress');
}

// Complete token
export function completeToken(tokenId: number): Token | null {
  return updateTokenStatus(tokenId, 'completed');
}

// Cancel token
export function cancelToken(tokenId: number): Token | null {
  return updateTokenStatus(tokenId, 'cancelled');
}

// Get token statistics for today
export function getTodayTokenStats() {
  const todayTokens = (listTable('tokens') as Token[]).filter((t) => isTokenFromToday(t));
  return {
    total: todayTokens.length,
    waiting: todayTokens.filter((t) => t.status === 'waiting').length,
    inProgress: todayTokens.filter((t) => t.status === 'in_progress').length,
    completed: todayTokens.filter((t) => t.status === 'completed').length,
  };
}

// Reset daily tokens (called at midnight or when needed)
export function resetDailyTokens(): void {
  // This is handled automatically by the date filter in queries
  // Token numbers are generated based on current date
}
