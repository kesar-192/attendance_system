import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/DataTable';
import { Badge, ErrorNote, Field, Modal, PageHeader, statusTone } from '../../components/ui';
import { formatDate } from '../../utils/format';

export default function LeaveReview() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [reload, setReload] = useState(0);
  const [target, setTarget] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const fetcher = async (params) => {
    const { q: _q, ...rest } = params;
    const { data } = await client.get('/leaves', { params: rest });
    return { rows: data.data, meta: data.meta };
  };

  function open(leave) {
    setTarget(leave);
    setComment('');
    setError('');
  }

  async function decide(decision) {
    setBusy(decision);
    setError('');
    try {
      await client.patch(`/leaves/${target._id}/review`, { status: decision, comment });
      toast.success(`Leave ${decision}`);
      setTarget(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const columns = [
    { key: 'student', label: 'Student', render: (l) => (
      <div>
        <p className="font-semibold">{l.studentId?.userId?.name}</p>
        <p className="text-xs text-muted">{l.studentId?.enrollmentNo}, {l.studentId?.courseId?.code} sem {l.studentId?.semester}</p>
      </div>
    ) },
    { key: 'dates', label: 'Dates', render: (l) => `${formatDate(l.fromDate)} to ${formatDate(l.toDate)}` },
    { key: 'type', label: 'Type', render: (l) => <span className="capitalize">{l.type}</span> },
    { key: 'reason', label: 'Reason', className: 'max-w-xs', render: (l) => <span className="line-clamp-2">{l.reason}</span> },
    { key: 'status', label: 'Status', render: (l) => <Badge tone={statusTone(l.status)}>{l.status}</Badge> },
    {
      key: 'actions',
      label: '',
      render: (l) =>
        l.status === 'pending' ? (
          <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => open(l)}>
            Review
          </button>
        ) : (
          <span className="text-xs text-muted">{l.reviewedBy?.name}</span>
        )
    }
  ];

  return (
    <div>
      <PageHeader title="Leave requests" subtitle="Approve or reject leave from students in your courses. Students are notified of your decision." />
      <DataTable
        columns={columns}
        fetcher={fetcher}
        reloadKey={reload}
        searchable={false}
        extraParams={{ status: status || undefined }}
        toolbar={
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="pending">Waiting for review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All requests</option>
          </select>
        }
        emptyTitle={status === 'pending' ? 'Nothing to review' : 'No requests'}
        emptyText={status === 'pending' ? 'New requests from your students will show up here.' : undefined}
      />
      <Modal
        open={Boolean(target)}
        title="Review leave request"
        onClose={() => !busy && setTarget(null)}
        footer={
          <>
            <button type="button" className="btn-danger" disabled={Boolean(busy)} onClick={() => decide('rejected')}>
              {busy === 'rejected' ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />} Reject
            </button>
            <button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => decide('approved')}>
              {busy === 'approved' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve
            </button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <ErrorNote>{error}</ErrorNote>
            <div className="rounded-md bg-paper p-3 text-sm">
              <p className="font-semibold">{target.studentId?.userId?.name}</p>
              <p className="text-muted">
                {formatDate(target.fromDate)} to {formatDate(target.toDate)}, <span className="capitalize">{target.type}</span>
              </p>
              <p className="mt-2">{target.reason}</p>
            </div>
            <Field label="Note to the student (optional)" htmlFor="review-comment">
              <textarea id="review-comment" className="input" rows={3} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
