/** Convert Firestore Timestamp, ISO string, or Date to a JS Date. */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

/** Format an ISO date string to a human-readable US date. */
export function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}
