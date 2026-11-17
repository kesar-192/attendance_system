import { useState } from 'react';
import { Plus, XCircle } from 'lucide-react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import { Badge, ConfirmDialog, PageHeader, statusTone } from '../../components/ui';
import { formatDate, todayLocal } from '../../utils/format';

const TYPES = ['sick', 'medical', 'family', 'event', 'casual', 'other'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }));

const fields = [
  { name: 'type', label: 'Type of leave', type: 'select', options: TYPES, required: true },
  { name: 'fromDate', label: 'From', type: 'date', required: true },
  { name: 'toDate', label: 'To', type: 'date', required: true },
  { name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }
];

export default function StudentLeaves() {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(null);

  const fetcher = async (params) => {
    const { data } = await client.get('/leaves', { params });
    return { rows: data.data, meta: data.meta };
  };

  const columns = [
    { key: 'dates', label: 'Dates', render: (l) => `${formatDate(l.fromDate)} to ${formatDate(l.toDate)}` },
    { key: 'type', label: 'Type', render: (l) => <span className="capitalize">{l.type}</span> },
    { key: 'reason', label: 'Reason', className: 'max-w-xs', render: (l) => <span className="line-clamp-2">{l.reason}</span> },
    { key: 'status', label: 'Status', render: (l) => <Badge tone={statusTone(l.status)}>{l.status}</Badge> },
    {
      key: 'review',
      label: 'Reviewer note',
      render: (l) => (l.reviewedBy ? `${l.reviewedBy.name}${l.reviewComment ? `: ${l.reviewComment}` : ''}` : '-')
    },
    {
      key: 'actions',
      label: '',
      render: (l) =>
        l.status === 'pending' && (
          <button type="button" className="btn-ghost px-2 py-1 text-sm text-shortage" onClick={() => setCancelling(l)}>
            <XCircle size={16} /> Cancel
          </button>
        )
    }
  ];

  async function confirmCancel() {
    try {
      await client.patch(`/leaves/${cancelling._id}/cancel`);
      toast.success('Leave request cancelled');
      setReload((n) => n + 1);
    } catch (err) {
      toast.fromError(err);
    }
    setCancelling(null);
  }

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle="Apply for leave and follow its approval. Your faculty and the administrator are notified."
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Apply for leave
          </button>
        }
      />
      <DataTable columns={columns} fetcher={fetcher} reloadKey={reload} searchable={false} emptyTitle="No leave requests" emptyText="Apply for leave when you expect to miss classes." />
      <FormModal
        open={open}
        title="Apply for leave"
        fields={fields}
        initial={{ type: 'sick', fromDate: todayLocal(), toDate: todayLocal() }}
        submitLabel="Submit request"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await client.post('/leaves', payload);
          toast.success('Leave request submitted');
          setOpen(false);
          setReload((n) => n + 1);
        }}
      />
      <ConfirmDialog open={Boolean(cancelling)} title="Cancel this request?" message="The request will be withdrawn and nobody will review it." confirmLabel="Cancel request" danger onConfirm={confirmCancel} onCancel={() => setCancelling(null)} />
    </div>
  );
}
