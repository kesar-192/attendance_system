import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import { ConfirmDialog, EmptyState, ErrorNote, PageHeader, Spinner } from '../../components/ui';
import { personName } from '../../utils/format';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const fields = [
  { name: 'subjectId', label: 'Subject', type: 'select', required: true, colSpan: 2, optionsFrom: { url: '/subjects', label: (s) => `${s.code} - ${s.name} (Sem ${s.semester})`, value: (s) => s._id }, help: 'Course, semester and faculty come from the subject.' },
  { name: 'dayOfWeek', label: 'Day', type: 'select', required: true, options: DAYS.map((d) => ({ value: d, label: d })) },
  { name: 'room', label: 'Room' },
  { name: 'startTime', label: 'Starts', type: 'time', required: true },
  { name: 'endTime', label: 'Ends', type: 'time', required: true }
];

export default function Timetable({ manage = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    client
      .get('/timetable', { params: { mine: user.role === 'faculty' ? true : undefined } })
      .then(({ data }) => setEntries(data.data))
      .catch((err) => setError(errorMessage(err)));
  }, [user.role]);

  useEffect(load, [load]);

  async function save(payload) {
    if (editing === 'new') await client.post('/timetable', payload);
    else await client.patch(`/timetable/${editing._id}`, payload);
    toast.success(editing === 'new' ? 'Class added to the timetable' : 'Timetable updated');
    setEditing(null);
    load();
  }

  async function remove() {
    try {
      await client.delete(`/timetable/${deleting._id}`);
      toast.success('Class removed');
      load();
    } catch (err) {
      toast.fromError(err);
    }
    setDeleting(null);
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!entries) return <Spinner label="Loading timetable" />;

  const byDay = DAYS.map((day) => ({ day, items: entries.filter((e) => e.dayOfWeek === day) })).filter((d) => d.items.length > 0 || (manage && d.day !== 'Sunday'));

  return (
    <div>
      <PageHeader
        title="Weekly timetable"
        subtitle={manage ? 'Add each class once. Clashes for the same faculty member or class are blocked.' : user.role === 'faculty' ? 'Classes you teach this week.' : 'Your class schedule for the week.'}
        actions={
          manage && (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add class
            </button>
          )
        }
      />
      {entries.length === 0 && !manage ? (
        <div className="panel">
          <EmptyState title="No classes scheduled" text="Your timetable will appear here once the administrator publishes it." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byDay.map(({ day, items }) => (
            <section key={day} className="panel overflow-hidden">
              <h2 className="border-b border-line bg-paper px-4 py-2.5 text-lg font-semibold">{day}</h2>
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">No classes</p>
              ) : (
                <ul className="divide-y divide-line">
                  {items.map((e) => (
                    <li key={e._id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-semibold tabular-nums">
                          {e.startTime} to {e.endTime}
                        </p>
                        <p className="text-sm">
                          {e.subjectId?.code} - {e.subjectId?.name}
                        </p>
                        <p className="text-xs text-muted">
                          {user.role !== 'faculty' && `${personName(e.facultyId)}, `}
                          {manage && `${e.courseId?.code} sem ${e.semester}, `}
                          {e.room ? `Room ${e.room}` : 'Room not set'}
                        </p>
                      </div>
                      {manage && (
                        <div className="flex shrink-0">
                          <button type="button" className="btn-ghost px-2 py-1" onClick={() => setEditing(e)} aria-label="Edit class">
                            <Pencil size={16} />
                          </button>
                          <button type="button" className="btn-ghost px-2 py-1 text-shortage" onClick={() => setDeleting(e)} aria-label="Remove class">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      {manage && (
        <>
          <FormModal
            open={Boolean(editing)}
            title={editing === 'new' ? 'Add class' : 'Edit class'}
            fields={fields}
            initial={editing && editing !== 'new' ? { subjectId: editing.subjectId?._id, dayOfWeek: editing.dayOfWeek, startTime: editing.startTime, endTime: editing.endTime, room: editing.room } : { dayOfWeek: 'Monday' }}
            submitLabel={editing === 'new' ? 'Add class' : 'Save changes'}
            onSubmit={save}
            onClose={() => setEditing(null)}
          />
          <ConfirmDialog open={Boolean(deleting)} danger title="Remove this class?" message="It will disappear from every timetable." confirmLabel="Remove" onConfirm={remove} onCancel={() => setDeleting(null)} />
        </>
      )}
    </div>
  );
}
