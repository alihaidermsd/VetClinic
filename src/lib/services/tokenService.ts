import { query, getOne, run } from '../database';
import type { Token, TokenStatus, RoomQueueItem } from '@/types';

// Get current date in YYYY-MM-DD format
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Generate next token number for today
export function generateTokenNumber(): number {
  const today = getCurrentDate();
  const lastToken = getOne(
    'SELECT MAX(token_number) as last_number FROM tokens WHERE date = ?',
    [today]
  );
  
  return (lastToken?.last_number || 0) + 1;
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
  
  // First create the token
  const tokenResult = run(
    'INSERT INTO tokens (token_number, bill_id, patient_id, animal_id, status, date) VALUES (?, 0, ?, ?, ?, ?)',
    [tokenNumber, patientId, animalId, 'waiting', getCurrentDate()]
  );
  
  const tokenId = tokenResult.lastInsertRowid;
  
  // Then create the bill with the token ID
  const billResult = run(
    'INSERT INTO bills (bill_code, patient_id, animal_id, token_id, total_amount, discount_amount, discount_percent, final_amount, paid_amount, payment_status, status) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)',
    [billCode, patientId, animalId, tokenId, 'pending', 'active']
  );
  
  // Update token with bill_id
  run('UPDATE tokens SET bill_id = ? WHERE id = ?', [billResult.lastInsertRowid, tokenId]);
  
  return getTokenById(tokenId) as Token;
}

// Get token by ID
export function getTokenById(id: number): Token | null {
  return getOne('SELECT * FROM tokens WHERE id = ?', [id]) as Token | null;
}

// Get token by token number (today only)
export function getTokenByNumber(tokenNumber: number): Token | null {
  return getOne('SELECT * FROM tokens WHERE token_number = ? AND date = ?', [tokenNumber, getCurrentDate()]) as Token | null;
}

// Get today's tokens
export function getTodayTokens(): Token[] {
  return query(
    'SELECT * FROM tokens WHERE date = ? ORDER BY token_number DESC',
    [getCurrentDate()]
  ) as Token[];
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
  const today = getCurrentDate();
  const items = query(
    `SELECT 
      t.id as token_id,
      t.token_number,
      t.bill_id,
      p.owner_name as patient_name,
      p.owner_phone,
      a.name as animal_name,
      a.type as animal_type,
      t.status,
      t.created_at as waiting_since
    FROM tokens t
    JOIN patients p ON t.patient_id = p.id
    JOIN animals a ON t.animal_id = a.id
    WHERE t.room_id = ? AND t.date = ? AND t.status IN ('waiting', 'in_progress')
    ORDER BY t.token_number`,
    [roomId, today]
  );
  
  return items as RoomQueueItem[];
}

// Get waiting tokens for a room type
export function getWaitingTokensByRoomType(roomType: string): RoomQueueItem[] {
  const today = getCurrentDate();
  const items = query(
    `SELECT 
      t.id as token_id,
      t.token_number,
      t.bill_id,
      p.owner_name as patient_name,
      p.owner_phone,
      a.name as animal_name,
      a.type as animal_type,
      t.status,
      t.created_at as waiting_since
    FROM tokens t
    JOIN patients p ON t.patient_id = p.id
    JOIN animals a ON t.animal_id = a.id
    JOIN rooms r ON t.room_id = r.id
    WHERE r.type = ? AND t.date = ? AND t.status IN ('waiting', 'in_progress')
    ORDER BY t.token_number`,
    [roomType, today]
  );
  
  return items as RoomQueueItem[];
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
  const today = getCurrentDate();
  
  const total = getOne('SELECT COUNT(*) as count FROM tokens WHERE date = ?', [today]) as { count: number };
  const waiting = getOne('SELECT COUNT(*) as count FROM tokens WHERE date = ? AND status = ?', [today, 'waiting']) as { count: number };
  const inProgress = getOne('SELECT COUNT(*) as count FROM tokens WHERE date = ? AND status = ?', [today, 'in_progress']) as { count: number };
  const completed = getOne('SELECT COUNT(*) as count FROM tokens WHERE date = ? AND status = ?', [today, 'completed']) as { count: number };
  
  return {
    total: total.count,
    waiting: waiting.count,
    inProgress: inProgress.count,
    completed: completed.count,
  };
}

// Reset daily tokens (called at midnight or when needed)
export function resetDailyTokens(): void {
  // This is handled automatically by the date filter in queries
  // Token numbers are generated based on current date
}
