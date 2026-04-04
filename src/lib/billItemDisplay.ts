import { getUserById } from '@/lib/services/userService';

function hasDoctorHonorific(name: string): boolean {
  const n = name.trim();
  return /^(dr\.?|doctor)\s+/i.test(n);
}

/**
 * Display name for the person who added a line. Doctors get a "Dr." prefix on bills when missing.
 * `itemTypeHint` helps legacy rows without `operator_id` (consultation lines are assumed to be a doctor).
 */
export function formatBillOperatorDisplay(
  operatorName: string,
  operatorId?: number | null,
  itemTypeHint?: string | null
): string {
  const raw = String(operatorName ?? '').trim();
  if (!raw) return '';

  let role: string | undefined;
  if (operatorId != null && Number(operatorId) > 0) {
    const u = getUserById(Number(operatorId));
    role = u?.role;
  }

  const type = String(itemTypeHint ?? '').trim().toLowerCase();
  const treatAsDoctor =
    role === 'doctor' ||
    (role == null && (type === 'consultation' || type === 'procedure'));

  if (treatAsDoctor && !hasDoctorHonorific(raw)) {
    return `Dr. ${raw}`;
  }
  return raw;
}

/** Label for bill line items: show who added the charge (doctor, pharmacist, etc.), not only the room name. */
export function billItemProviderLabel(item: {
  operator_name?: unknown;
  operator_id?: unknown;
  room_name?: unknown;
  item_type?: unknown;
}): string {
  const opName = String(item.operator_name ?? '').trim();
  const opId = item.operator_id != null && Number(item.operator_id) > 0 ? Number(item.operator_id) : undefined;
  const itemType = item.item_type != null ? String(item.item_type) : undefined;
  if (opName) {
    const formatted = formatBillOperatorDisplay(opName, opId, itemType);
    if (formatted) return formatted;
  }
  const room = String(item.room_name ?? '').trim();
  return room || '—';
}
