import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Loader2, Save } from 'lucide-react';
import client, { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { cx, todayLocal } from '../utils/format';
import { EmptyState, ErrorNote, Spinner } from './ui';

const OPTIONS = [
  { value: 'present', label: 'Present', on: 'bg-healthy text-white border-healthy' },
  { value: 'absent', label: 'Absent', on: 'bg-shortage text-white border-shortage' },
  { value: 'late', label: 'Late', on: 'bg-caution text-white border-caution' },
  { value: 'excused', label: 'Excused', on: 'bg-brand text-white border-brand' }
];

/** Class attendance sheet: pick subject + date, mark everyone, save with one bulk request. */
export default function AttendanceSheet({ subjects, compact = false }) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [roster, setRoster] = useState(null);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0]._id);
  }, [subjects, subjectId]);

  const load = useCallback(async () => {
    if (!subjectId || !date) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/attendance/roster', { params: { subjectId, date } });
      setRoster(data.data);
      const existing = {};
      data.data.students.forEach((s) => {
        if (s.status) existing[s.studentId] = s.status;
      });
      setMarks(existing);
    } catch (err) {
      setRoster(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [subjectId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const students = roster?.students || [];
  const markedCount = Object.keys(marks).length;
  const counts = OPTIONS.map((o) => ({ ...o, n: Object.values(marks).filter((m) => m === o.value).length }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
      const { data } = await client.post('/attendance/bulk', { subjectId, date, records });
      const r = data.data;
      toast.success(`Attendance saved: ${r.created} new, ${r.updated} changed${r.lowAttendanceAlerts.length ? `, ${r.lowAttendanceAlerts.length} student(s) now below the threshold` : ''}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (subjects.length === 0) return <EmptyState title="No subjects assigned" text="Ask an administrator to assign a subject to you before marking attendance." />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="sheet-subject">
            Subject
          </label>
          <select id="sheet-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.code} - {s.name} (Sem {s.semester})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sheet-date">
            Date
          </label>
          <input id="sheet-date" type="date" className="input" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary" disabled={!students.length} onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present'])))}>
          <CheckCheck size={16} /> Mark all present
        </button>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {loading && !roster && <Spinner label="Loading class list" />}

      {roster && students.length === 0 && <EmptyState title="No students enrolled" text="No students are registered for this subject's course and semester." />}

      {students.length > 0 && (
        <>
          <div className={cx('overflow-auto rounded-lg border border-line', compact ? 'max-h-80' : 'max-h-[60vh]')}>
            <table className="min-w-full">
              <thead className="sticky top-0">
                <tr>
                  <th className="th">Enrollment</th>
                  <th className="th">Student</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId}>
                    <td className="td whitespace-nowrap font-semibold">{s.enrollmentNo}</td>
                    <td className="td">
                      {s.name}
                      {s.method === 'qr' && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark">via QR</span>}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Status for ${s.name}`}>
                        {OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={marks[s.studentId] === o.value}
                            onClick={() => setMarks((m) => ({ ...m, [s.studentId]: o.value }))}
                            className={cx('rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors', marks[s.studentId] === o.value ? o.on : 'border-line bg-white text-ink-700 hover:bg-paper')}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {markedCount} of {students.length} marked
              {counts.filter((c) => c.n).map((c) => ` - ${c.n} ${c.label.toLowerCase()}`)}
            </p>
            <button type="button" className="btn-primary" disabled={saving || markedCount === 0} onClick={save}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save attendance
            </button>
          </div>
        </>
      )}
    </div>
  );
}
