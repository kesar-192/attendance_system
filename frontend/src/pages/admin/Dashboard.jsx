import { useEffect, useState } from 'react';
import { BookOpen, CalendarOff, GraduationCap, Library, TriangleAlert, Users } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import AttendanceBar from '../../components/AttendanceBar';
import { BarsChart, TrendChart } from '../../components/charts';
import { ErrorNote, PageHeader, Spinner, StatCard } from '../../components/ui';
import { pct } from '../../utils/format';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/dashboard/admin')
      .then(({ data: res }) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Loading dashboard" />;
  const { totals } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="Institution overview" subtitle="Enrolment, attendance health and pending work across all departments." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Students" value={totals.students} icon={GraduationCap} />
        <StatCard label="Faculty" value={totals.faculty} icon={Users} />
        <StatCard label="Courses" value={totals.courses} icon={Library} />
        <StatCard label="Subjects" value={totals.subjects} icon={BookOpen} />
        <StatCard label="Leaves to review" value={totals.pendingLeaves} icon={CalendarOff} tone={totals.pendingLeaves ? 'caution' : 'neutral'} />
        <StatCard label={`Below ${data.threshold}% overall`} value={totals.lowAttendanceStudents} icon={TriangleAlert} tone={totals.lowAttendanceStudents ? 'shortage' : 'healthy'} hint="students" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-1">
          <h2 className="text-xl font-semibold">Institution attendance</h2>
          <p className="mb-4 mt-1 text-sm text-muted">All classes marked so far, excused classes excluded.</p>
          <p className="mb-3 font-serif text-4xl font-semibold tabular-nums">{pct(data.overallAttendance)}</p>
          <AttendanceBar value={data.overallAttendance} threshold={data.threshold} />
        </section>
        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-xl font-semibold">Last 14 days</h2>
          <p className="mb-2 mt-1 text-sm text-muted">Daily attendance across every subject. The dashed line is the {data.threshold}% requirement.</p>
          <TrendChart data={data.trend} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-xl font-semibold">Students per course</h2>
          <BarsChart data={data.studentsByCourse} xKey="code" yKey="students" label="Students" color="#13294B" />
        </section>
        <section className="panel p-5">
          <h2 className="text-xl font-semibold">Attendance by department</h2>
          <BarsChart data={data.departmentAnalytics} xKey="department" yKey="attendancePercentage" unit="%" threshold={data.threshold} label="Attendance" color="#0E7C7B" />
        </section>
      </div>

      <section className="panel overflow-x-auto">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-xl font-semibold">Department analytics</h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr>
              {['Department', 'Courses', 'Students', 'Classes marked', 'Attendance'].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.departmentAnalytics.map((d) => (
              <tr key={d.department}>
                <td className="td font-semibold">{d.department}</td>
                <td className="td">{d.courses}</td>
                <td className="td">{d.students}</td>
                <td className="td tabular-nums">{d.classesMarked}</td>
                <td className="td w-64">
                  <AttendanceBar value={d.attendancePercentage} counted={d.classesMarked} threshold={data.threshold} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
