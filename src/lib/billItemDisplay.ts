/** Label for bill line items: show who added the charge (doctor, pharmacist, etc.), not only the room name. */
export function billItemProviderLabel(item: {
  operator_name?: unknown;
  room_name?: unknown;
}): string {
  const op = String(item.operator_name ?? '').trim();
  if (op) return op;
  const room = String(item.room_name ?? '').trim();
  return room || '—';
}
