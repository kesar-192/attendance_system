import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import DataTable from './DataTable';
import FormModal from './FormModal';
import { ConfirmDialog, PageHeader } from './ui';

/** List + create + edit + delete screen driven entirely by configuration. */
export default function CrudPage({
  title,
  subtitle,
  noun,
  endpoint,
  columns,
  createFields,
  editFields,
  toForm = (row) => row,
  searchPlaceholder,
  toolbar,
  extraParams,
  extraActions
}) {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetcher = async (params) => {
    const { data } = await client.get(endpoint, { params });
    return { rows: data.data, meta: data.meta };
  };

  const allColumns = [
    ...columns,
    {
      key: '_actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          {extraActions && extraActions(row, () => setReload((n) => n + 1))}
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => setEditing(row)} aria-label={`Edit ${noun}`}>
            <Pencil size={16} />
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-shortage" onClick={() => setDeleting(row)} aria-label={`Delete ${noun}`}>
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  async function save(payload) {
    if (editing === 'new') {
      await client.post(endpoint, payload);
      toast.success(`${noun} created`);
    } else {
      await client.patch(`${endpoint}/${editing._id}`, payload);
      toast.success(`${noun} updated`);
    }
    setEditing(null);
    setReload((n) => n + 1);
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await client.delete(`${endpoint}/${deleting._id}`);
      toast.success(`${noun} deleted`);
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (err) {
      toast.fromError(err);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const isNew = editing === 'new';
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Add {noun}
          </button>
        }
      />
      <DataTable columns={allColumns} fetcher={fetcher} reloadKey={reload} searchPlaceholder={searchPlaceholder || `Search ${noun}s`} toolbar={toolbar} extraParams={extraParams} emptyTitle={`No ${noun}s yet`} emptyText={`Add the first ${noun} to get started.`} />
      <FormModal
        open={Boolean(editing)}
        wide
        title={isNew ? `Add ${noun}` : `Edit ${noun}`}
        fields={isNew ? createFields : editFields || createFields}
        initial={isNew ? {} : editing ? toForm(editing) : {}}
        submitLabel={isNew ? `Create ${noun}` : 'Save changes'}
        onSubmit={save}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog open={Boolean(deleting)} danger busy={busy} title={`Delete ${noun}?`} message={`This permanently removes the ${noun} and anything that depends on it. This cannot be undone.`} confirmLabel="Delete" onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
