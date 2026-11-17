import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOff, ScanLine, TriangleAlert } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import AttendanceBar from '../../components/AttendanceBar';
import DataTable from '../../components/DataTable';
import { Badge, EmptyState, ErrorNote, PageHeader, Spinner, statusTone } from '../../components/ui';
import { formatDate, pct } from '../../utils/format';

export default function StudentDashboard() {
  const [summary, setSummary] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([client.get('/attendance/summary/me'), client.get('/leaves', { params: { limit: 5 } })])
      .then(([s, l]) => {
        setSummary(s.data.data);
        setLeaves(l.data.data);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const history = useCallback(async (params) => {
    const { data } = await client.get('/attendance', { params });
    return { rows: data.data, meta: data.meta };
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!summary) return <Spinner label="Loading your attendance" />;

  const { overall, subjects, threshold } = summary;
  const short = subjects.filter((s) => s.lowAttendanceAlert);

  const columns = [
    { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
    { key: 'subject', label: 'Subject', render: (r) => `${r.subjectId?.code} - ${r.subjectId?.name}` },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'method', label: 'Marked by', render: (r) => (r.method === 'qr' ? 'QR scan' : 'Faculty') },
    { key: 'remarks', label: 'Remarks', render: (r) => r.remarks || '-' }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${summary.student.name?.split(' ')[0] || 'student'}`}
        subtitle={`${summary.student.course}, semester ${summary.student.semester}. Enrollment ${summary.student.enrollmentNo}.`}
        actions={
          <Link to="/student/scan" className="btn-primary">
            <ScanLine size={16} /> Scan QR
          </Link>
        }
      />

      {short.length > 0 && (
        <div role="alert" className="rounded-lg border border-shortage/30 bg-shortage-soft p-4 text-shortage">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={20} /> Attendance shortage in {short.length} subject{short.length > 1 ? 's' : ''}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {short.map((s) => (
              <li key={s.subjectId}>
                <span className="font-semibold">{s.name}</span> is at {pct(s.percentage)}. Attend the next {s.classesNeeded} class{s.classesNeeded === 1 ? '' : 'es'} in a row to get back to {threshold}%.
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="panel p-5">
        <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <p className="text-sm text-muted">Overall attendance</p>
            <p className={`font-serif text-5xl font-semibold tabular-nums ${overall.lowAttendanceAlert ? 'text-shortage' : 'text-healthy'}`}>{overall.counted ? pct(overall.percentage) : '-'}</p>
          </div>
          <div>
            <AttendanceBar value={overall.percentage} counted={overall.counted} threshold={threshold} />
            <p className="mt-2 text-sm text-muted">
              {overall.attended} attended of {overall.counted} classes counted
              {overall.excused > 0 && `, ${overall.excused} excused not counted`}.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Subjects</h2>
        {subjects.length === 0 ? (
          <div className="panel">
            <EmptyState title="No subjects yet" text="Subjects for your course and semester will appear here." />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((s) => (
              <article key={s.subjectId} className={`panel p-4 ${s.lowAttendanceAlert ? 'ring-1 ring-shortage/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.code}
                      {s.faculty ? `, ${s.faculty}` : ''}
                    </p>
                  </div>
                  {s.lowAttendanceAlert && <Badge tone="shortage">Shortage</Badge>}
                </div>
                <div className="mt-4">
                  <AttendanceBar value={s.percentage} counted={s.counted} threshold={threshold} />
                </div>
                <p className="mt-3 text-xs text-muted">
                  {s.present} present, {s.late} late, {s.absent} absent{s.excused ? `, ${s.excused} excused` : ''} of {s.total} classes
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Leave requests</h2>
          <Link to="/student/leaves" className="text-sm font-semibold text-brand hover:underline">
            Apply or manage
          </Link>
        </div>
        {leaves.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CalendarOff size={16} /> You have not applied for any leave.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {leaves.map((l) => (
              <li key={l._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  {formatDate(l.fromDate)} to {formatDate(l.toDate)}, <span className="capitalize">{l.type}</span>
                </span>
                <Badge tone={statusTone(l.status)}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Attendance history</h2>
        <DataTable columns={columns} fetcher={history} searchable={false} emptyTitle="No attendance marked yet" emptyText="Your records will show here once classes are marked." />
      </section>
    </div>
  );
}
