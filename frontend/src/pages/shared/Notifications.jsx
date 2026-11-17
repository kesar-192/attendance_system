import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import { Badge, EmptyState, ErrorNote, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

const TONE = { alert: 'shortage', leave: 'brand', attendance: 'healthy', timetable: 'caution', system: 'neutral' };
const changed = () => window.dispatchEvent(new Event('notifications:changed'));

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    client
      .get('/notifications', { params: { page, limit: 15 } })
      .then(({ data }) => {
        setItems(data.data);
        setMeta(data.meta);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [page]);

  useEffect(load, [load]);

  async function open(n) {
    if (!n.read) {
      await client.patch(`/notifications/${n._id}/read`).catch(() => {});
      changed();
    }
    if (n.link) navigate(n.link);
    else load();
  }

  async function markAll() {
    await client.patch('/notifications/read-all');
    changed();
    load();
  }

  async function remove(id) {
    await client.delete(`/notifications/${id}`);
    changed();
    load();
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!items) return <Spinner label="Loading notifications" />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={meta?.unread ? `${meta.unread} unread` : 'You are all caught up.'}
        actions={
          <button type="button" className="btn-secondary" onClick={markAll} disabled={!meta?.unread}>
            <CheckCheck size={16} /> Mark all as read
          </button>
        }
      />
      <div className="panel overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="No notifications" text="Leave updates and attendance warnings will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n._id} className={`flex items-start gap-3 px-4 py-3.5 ${n.read ? '' : 'bg-brand-soft/50'}`}>
                <Bell size={18} className={`mt-1 shrink-0 ${n.read ? 'text-ink-300' : 'text-brand'}`} aria-hidden="true" />
                <button type="button" onClick={() => open(n)} className="flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={n.read ? 'font-medium' : 'font-semibold'}>{n.title}</span>
                    <Badge tone={TONE[n.type]}>{n.type}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-700">{n.message}</span>
                  <span className="mt-1 block text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                </button>
                <button type="button" className="btn-ghost px-2 py-1 text-muted" onClick={() => remove(n._id)} aria-label="Delete notification">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {meta && meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="tabular-nums text-muted">
            Page {meta.page} of {meta.pages}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
