export const THRESHOLD = 75;

export const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

export function formatDate(value) {
  if (!value) return '-';
  const [y, m, d] = dateOnly(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Today as YYYY-MM-DD in the browser's local calendar. */
export function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const pct = (n) => `${Number(n || 0).toFixed(Number.isInteger(n) ? 0 : 1)}%`;

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export const personName = (p) => p?.userId?.name || '-';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
