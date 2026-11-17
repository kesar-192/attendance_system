import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { errorMessage } from '../api/client';
import { EmptyState, ErrorNote, Spinner } from './ui';

/**
 * Server-side searchable + paginated table.
 * fetcher({ q, page, limit, ...extraParams }) -> Promise<{ rows, meta }>
 */
export default function DataTable({ columns, fetcher, searchable = true, searchPlaceholder = 'Search', toolbar, reloadKey = 0, limit = 10, extraParams, emptyTitle = 'Nothing here yet', emptyText }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], meta: null, loading: true, error: null });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const paramsKey = JSON.stringify(extraParams || {});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => setPage(1), [paramsKey]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current({ q: debouncedQ || undefined, page, limit, ...JSON.parse(paramsKey) })
      .then(({ rows, meta }) => !cancelled && setState({ rows, meta, loading: false, error: null }))
      .catch((err) => !cancelled && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, page, limit, reloadKey, paramsKey]);

  const { rows, meta, loading, error } = state;
  const from = meta && meta.total > 0 ? (meta.page - 1) * meta.limit + 1 : 0;
  const to = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="panel overflow-hidden">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          {searchable && (
            <div className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input className="input pl-9" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            </div>
          )}
          {toolbar}
        </div>
      )}
      {error && (
        <div className="p-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`th ${c.className || ''}`} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row._id || row.id || i} className="hover:bg-paper/60">
                {columns.map((c) => (
                  <td key={c.key} className={`td ${c.className || ''}`}>
                    {c.render ? c.render(row) : row[c.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && rows.length === 0 && <Spinner />}
      {!loading && !error && rows.length === 0 && <EmptyState title={emptyTitle} text={emptyText || (debouncedQ ? 'No results match your search.' : undefined)} />}
      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-muted">
          <span>
            Showing {from}-{to} of {meta.total}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary px-2 py-1.5" disabled={meta.page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft size={16} />
            </button>
            <span className="tabular-nums">
              Page {meta.page} of {meta.pages}
            </span>
            <button type="button" className="btn-secondary px-2 py-1.5" disabled={meta.page >= meta.pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
