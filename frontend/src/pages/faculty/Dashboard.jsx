import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarOff, ClipboardList, Percent } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import AttendanceBar from '../../components/AttendanceBar';
import AttendanceSheet from '../../components/AttendanceSheet';
import QrGenerator from '../../components/QrGenerator';
import { TrendChart } from '../../components/charts';
import { EmptyState, ErrorNote, PageHeader, Spinner, StatCard } from '../../components/ui';
import { pct } from '../../utils/format';

export default function FacultyDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [trendSubject, setTrendSubject] = useState('');
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    client
      .get('/dashboard/faculty')
      .then(({ data: res }) => {
        setData(res.data);
        setTrend(res.data.trend);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // class attendance trend for the chosen subject (all subjects when empty)
  useEffect(() => {
    if (!data) return;
    client
      .get('/attendance/trends', { params: { subjectId: trendSubject || undefined } })
      .then(({ data: res }) => setTrend(res.data))
      .catch(() => setTrend([]));
  }, [trendSubject, data]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Loading dashboard" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Your classes" subtitle="Subjects assigned to you, today's schedule and quick tools to record attendance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Subjects" value={data.subjects.length} icon={ClipboardList} />
        <StatCard label="Classes today" value={data.todayClasses.length} icon={CalendarClock} />
        <StatCard label="Average attendance" value={pct(data.overallAttendance)} icon={Percent} tone={data.overallAttendance < data.threshold && data.subjects.length ? 'shortage' : 'healthy'} />
        <StatCard label="Leaves to review" value={data.pendingLeaves} icon={CalendarOff} tone={data.pendingLeaves ? 'caution' : 'neutral'} />
      </div>

      {data.todayClasses.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-xl font-semibold">Today's schedule</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.todayClasses.map((c) => (
              <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-semibold">
                  {c.subjectId?.code} - {c.subjectId?.name}
                </span>
                <span className="text-muted">
                  {c.startTime} to {c.endTime}
                  {c.room ? `, room ${c.room}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Assigned subjects</h2>
        {data.subjects.length === 0 ? (
          <div className="panel">
            <EmptyState title="No subjects assigned yet" text="An administrator assigns subjects to you. They will appear here." />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.subjects.map((s) => (
              <article key={s._id} className="panel p-4">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-muted">
                  {s.code}, {s.course}, semester {s.semester}
                </p>
                <div className="mt-4">
                  <AttendanceBar value={s.percentage} counted={s.counted} threshold={data.threshold} />
                </div>
                <p className="mt-3 text-sm text-muted">
                  {s.enrolledStudents} enrolled
                  {s.lowAttendanceStudents > 0 && <span className="font-semibold text-shortage">, {s.lowAttendanceStudents} below {data.threshold}%</span>}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Quick attendance</h2>
            <Link to="/faculty/attendance" className="text-sm font-semibold text-brand hover:underline">
              Open full sheet
            </Link>
          </div>
          <AttendanceSheet subjects={data.subjects} compact />
        </section>
        <section className="panel p-5 xl:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">QR session</h2>
          <QrGenerator subjects={data.subjects} />
        </section>
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Class attendance trend</h2>
            <p className="text-sm text-muted">Last 30 days. The dashed line is the {data.threshold}% requirement.</p>
          </div>
          <select className="input w-auto" value={trendSubject} onChange={(e) => setTrendSubject(e.target.value)} aria-label="Subject for trend chart">
            <option value="">All my subjects</option>
            {data.subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <TrendChart data={trend} />
        </div>
      </section>
    </div>
  );
}
