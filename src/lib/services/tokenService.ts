import { getOne, run, listTable } from '../database';
import type { Token, TokenStatus, RoomQueueItem, TokenReferral } from '@/types';

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

  // One `?` per column — paramsToObject maps by column index; mixed literals used to break this.
  const tokenResult = run(
    'INSERT INTO tokens (token_number, bill_id, patient_id, animal_id, status, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tokenNumber, 0, patientId, animalId, 'waiting', today, ts]
  );

  const tokenId = tokenResult.lastInsertRowid;

  const billResult = run(
    'INSERT INTO bills (bill_code, patient_id, animal_id, token_id, total_amount, discount_amount, discount_percent, final_amount, paid_amount, payment_status, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [billCode, patientId, animalId, tokenId, 0, 0, 0, 0, 0, 'pending', 'active', ts, ts]
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
    updates.push('completed_at = ?');
    values.push(new Date().toISOString());
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

// ——— Multi-room referrals (token_referrals) ———

export function listReferralsForToken(tokenId: number): TokenReferral[] {
  return (listTable('token_referrals') as TokenReferral[])
    .filter((r) => Number(r.token_id) === Number(tokenId))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function getActiveReferralsForToken(tokenId: number): TokenReferral[] {
  return listReferralsForToken(tokenId).filter(
    (r) => r.status === 'pending' || r.status === 'in_progress'
  );
}

export function hasPendingReferralToRoom(tokenId: number, roomId: number): boolean {
  return listReferralsForToken(tokenId).some(
    (r) =>
      Number(r.room_id) === Number(roomId) &&
      (r.status === 'pending' || r.status === 'in_progress')
  );
}

function getFirstDoctorRoomId(): number | null {
  const rooms = listTable('rooms') as { id: number; type: string; is_active?: boolean | number }[];
  const d = rooms.find(
    (r) => String(r.type) === 'doctor_room' && (r.is_active === 1 || r.is_active === true)
  );
  return d ? Number(d.id) : null;
}

function cancelOpenReferralsForToken(tokenId: number): void {
  for (const r of getActiveReferralsForToken(tokenId)) {
    run('UPDATE token_referrals SET status = ? WHERE id = ?', ['cancelled', r.id]);
  }
}

/** Doctor sends patient to one or more rooms at once. Queues use referrals when there are multiple stops. */
export function referPatientToRooms(tokenId: number, roomIds: number[]): void {
  const token = getTokenById(tokenId);
  if (!token) return;

  const unique = [...new Set(roomIds.map(Number))].filter((id) => Number.isFinite(id) && id > 0);
  if (unique.length === 0) return;

  const ts = new Date().toISOString();
  for (const roomId of unique) {
    const exists = (listTable('token_referrals') as TokenReferral[]).some(
      (r) =>
        Number(r.token_id) === tokenId &&
        Number(r.room_id) === roomId &&
        (r.status === 'pending' || r.status === 'in_progress')
    );
    if (!exists) {
      run('INSERT INTO token_referrals (token_id, room_id, status, created_at) VALUES (?, ?, ?, ?)', [
        tokenId,
        roomId,
        'pending',
        ts,
      ]);
    }
  }

  const activeRoomIds = [
    ...new Set(getActiveReferralsForToken(tokenId).map((r) => Number(r.room_id))),
  ];

  if (activeRoomIds.length === 1) {
    assignTokenToRoom(tokenId, activeRoomIds[0]);
  } else if (activeRoomIds.length > 1) {
    run('UPDATE tokens SET room_id = ?, status = ? WHERE id = ?', [null, 'waiting', tokenId]);
    const t2 = getTokenById(tokenId);
    if (t2) {
      run('UPDATE bills SET current_room_id = ? WHERE id = ?', [null, t2.bill_id]);
    }
  }
}

/** Lab / X-ray / surgery: start visit when patient was only on the referral list (no physical room yet). */
export function activateReferralAtRoom(tokenId: number, roomId: number): Token | null {
  const pending = (listTable('token_referrals') as TokenReferral[]).find(
    (r) =>
      Number(r.token_id) === tokenId &&
      Number(r.room_id) === roomId &&
      r.status === 'pending'
  );
  if (pending) {
    run('UPDATE token_referrals SET status = ? WHERE id = ?', ['in_progress', pending.id]);
  }
  assignTokenToRoom(tokenId, roomId);
  return updateTokenStatus(tokenId, 'in_progress');
}

/**
 * Operator room finished this step. If other referrals remain, patient goes to waiting (no room).
 * If none remain, patient returns to doctor room as waiting. Legacy tokens (no rows) still use completeToken.
 */
export function completeOperatorRoomVisit(tokenId: number, roomId: number): {
  legacyCompleted: boolean;
  moreReferralsPending: boolean;
  returnedToDoctor: boolean;
} {
  const refs = listReferralsForToken(tokenId);
  if (refs.length === 0) {
    completeToken(tokenId);
    return { legacyCompleted: true, moreReferralsPending: false, returnedToDoctor: false };
  }

  const match = refs.find(
    (r) =>
      Number(r.room_id) === Number(roomId) &&
      (r.status === 'pending' || r.status === 'in_progress')
  );
  if (match) {
    run('UPDATE token_referrals SET status = ? WHERE id = ?', ['completed', match.id]);
  }

  const token = getTokenById(tokenId);
  if (!token) {
    return { legacyCompleted: false, moreReferralsPending: false, returnedToDoctor: false };
  }

  const still = getActiveReferralsForToken(tokenId);
  const doctorRoomId = getFirstDoctorRoomId();

  if (still.length > 0) {
    run('UPDATE tokens SET room_id = ? WHERE id = ?', [null, tokenId]);
    run('UPDATE bills SET current_room_id = ? WHERE id = ?', [null, token.bill_id]);
    run('UPDATE tokens SET status = ? WHERE id = ?', ['waiting', tokenId]);
    return { legacyCompleted: false, moreReferralsPending: true, returnedToDoctor: false };
  }

  if (doctorRoomId != null) {
    assignTokenToRoom(tokenId, doctorRoomId);
  } else {
    run('UPDATE tokens SET room_id = ? WHERE id = ?', [null, tokenId]);
    run('UPDATE bills SET current_room_id = ? WHERE id = ?', [null, token.bill_id]);
    run('UPDATE tokens SET status = ? WHERE id = ?', ['waiting', tokenId]);
  }
  return { legacyCompleted: false, moreReferralsPending: false, returnedToDoctor: true };
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

// Get waiting tokens for a room type (physical room_id and/or multi-room referrals)
export function getWaitingTokensByRoomType(roomType: string): RoomQueueItem[] {
  const rooms = listTable('rooms') as { id: number; type: string }[];
  const roomsById = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const typeRoomIds = new Set(rooms.filter((r) => r.type === roomType).map((r) => Number(r.id)));

  const patients = Object.fromEntries(
    listTable('patients').map((p: { id: number; owner_name?: string; owner_phone?: string }) => [
      p.id,
      p,
    ])
  );
  const animals = Object.fromEntries(
    listTable('animals').map((a: { id: number; name?: string; type?: string }) => [a.id, a])
  );

  const tokens = (listTable('tokens') as Token[]).filter(
    (t) => isTokenFromToday(t) && (t.status === 'waiting' || t.status === 'in_progress')
  );
  const referrals = listTable('token_referrals') as TokenReferral[];

  const seen = new Set<number>();
  const matched: Token[] = [];

  for (const t of tokens) {
    let include = false;

    if (t.room_id != null && typeRoomIds.has(Number(t.room_id))) {
      const room = roomsById[t.room_id as keyof typeof roomsById];
      if (room?.type === roomType) {
        include = true;
      }
    }

    // Referral rows: include pending/in_progress referrals even when the token is still
    // in_progress at the doctor (or between multi-stop destinations). Physical room_id match
    // above already covers "being seen here" without duplicating.
    if (!include) {
      for (const ref of referrals) {
        if (Number(ref.token_id) !== t.id) continue;
        if (ref.status !== 'pending' && ref.status !== 'in_progress') continue;
        const rid = Number(ref.room_id);
        if (typeRoomIds.has(rid) && roomsById[rid as keyof typeof roomsById]?.type === roomType) {
          include = true;
          break;
        }
      }
    }

    if (include && !seen.has(t.id)) {
      seen.add(t.id);
      matched.push(t);
    }
  }

  return matched
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
  cancelOpenReferralsForToken(tokenId);
  return updateTokenStatus(tokenId, 'completed');
}

// Cancel token
export function cancelToken(tokenId: number): Token | null {
  cancelOpenReferralsForToken(tokenId);
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
