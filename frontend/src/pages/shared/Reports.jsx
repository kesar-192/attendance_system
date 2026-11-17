import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AttendanceBar from '../../components/AttendanceBar';
import DataTable from '../../components/DataTable';
import { Badge, PageHeader } from '../../components/ui';
import { downloadBlob, todayLocal } from '../../utils/format';

const EMPTY = { courseId: '', semester: '', subjectId: '', from: '', to: '', belowThreshold: false };

export default function Reports() {
  const { user } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    client.get('/courses', { params: { limit: 200 } }).then(({ data }) => setCourses(data.data)).catch(() => {});
    client
      .get('/subjects', { params: { limit: 200, mine: user.role === 'faculty' ? true : undefined } })
      .then(({ data }) => setSubjects(data.data))
      .catch(() => {});
  }, [user.role]);

  const params = {
    courseId: filters.courseId || undefined,
    semester: filters.semester || undefined,
    subjectId: filters.subjectId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    belowThreshold: filters.belowThreshold || undefined
  };

  const fetcher = async (p) => {
    const { q: _q, ...rest } = p;
    const { data } = await client.get('/attendance/reports', { params: rest });
    return { rows: data.data.map((r) => ({ ...r, _id: `${r.studentId}-${r.subjectId}` })), meta: data.meta };
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const response = await client.get('/attendance/reports', { params: { ...params, format: 'csv' }, responseType: 'blob' });
      downloadBlob(response.data, `attendance-report-${todayLocal()}.csv`);
    } catch (err) {
      // blob responses hide the JSON error body, so read it back
      let message = errorMessage(err);
      try {
        message = JSON.parse(await err.response.data.text()).message || message;
      } catch {
        /* keep the default message */
      }
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  const set = (name, value) => setFilters((f) => ({ ...f, [name]: value }));

  const columns = [
    { key: 'enrollmentNo', label: 'Enrollment', render: (r) => <span className="font-semibold">{r.enrollmentNo}</span> },
    { key: 'studentName', label: 'Student' },
    { key: 'subject', label: 'Subject', render: (r) => `${r.subjectCode} - ${r.subjectName}` },
    { key: 'classes', label: 'Present / Total', render: (r) => <span className="tabular-nums">{r.attended} / {r.counted}</span> },
    { key: 'percentage', label: 'Attendance', className: 'w-56', render: (r) => <AttendanceBar value={r.percentage} counted={r.counted} /> },
    { key: 'alert', label: '', render: (r) => r.lowAttendanceAlert && <Badge tone="shortage">Below 75%</Badge> }
  ];

  return (
    <div>
      <PageHeader
        title="Attendance reports"
        subtitle="Per student and subject. Filter the list, then export exactly what you see to CSV."
        actions={
          <button type="button" className="btn-primary" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export CSV
          </button>
        }
      />
      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="label" htmlFor="r-course">
            Course
          </label>
          <select id="r-course" className="input" value={filters.courseId} onChange={(e) => set('courseId', e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-sem">
            Semester
          </label>
          <select id="r-sem" className="input" value={filters.semester} onChange={(e) => set('semester', e.target.value)}>
            <option value="">All</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-subject">
            Subject
          </label>
          <select id="r-subject" className="input" value={filters.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-from">
            From
          </label>
          <input id="r-from" type="date" className="input" max={filters.to || todayLocal()} value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-to">
            To
          </label>
          <input id="r-to" type="date" className="input" min={filters.from} max={todayLocal()} value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
        <div className="flex items-end justify-between gap-2 lg:flex-col lg:items-start lg:justify-end">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={filters.belowThreshold} onChange={(e) => set('belowThreshold', e.target.checked)} />
            Only below 75%
          </label>
          <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setFilters(EMPTY)}>
            Clear filters
          </button>
        </div>
      </div>
      <DataTable columns={columns} fetcher={fetcher} searchable={false} extraParams={params} limit={15} emptyTitle="No attendance data" emptyText="Nothing matches these filters, or no classes have been marked yet." />
    </div>
  );
}
