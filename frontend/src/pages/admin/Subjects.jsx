import CrudPage from '../../components/CrudPage';
import { personName } from '../../utils/format';

const fields = [
  { name: 'name', label: 'Subject name', required: true },
  { name: 'code', label: 'Subject code', required: true },
  { name: 'courseId', label: 'Course', type: 'select', required: true, optionsFrom: { url: '/courses', label: (c) => `${c.name} (${c.code})`, value: (c) => c._id } },
  { name: 'semester', label: 'Semester', type: 'number', required: true, min: 1, max: 12 },
  { name: 'facultyId', label: 'Faculty', type: 'select', required: true, optionsFrom: { url: '/faculty', label: (f) => `${personName(f)} (${f.employeeId})`, value: (f) => f._id } },
  { name: 'credits', label: 'Credits', type: 'number', min: 1, max: 10 }
];

const columns = [
  { key: 'code', label: 'Code', render: (r) => <span className="font-semibold">{r.code}</span> },
  { key: 'name', label: 'Subject' },
  { key: 'course', label: 'Course', render: (r) => r.courseId?.name || '-' },
  { key: 'semester', label: 'Semester' },
  { key: 'faculty', label: 'Faculty', render: (r) => personName(r.facultyId) },
  { key: 'credits', label: 'Credits' }
];

export default function Subjects() {
  return (
    <CrudPage
      title="Subjects"
      subtitle="Each subject is taught by one faculty member to one course and semester."
      noun="subject"
      endpoint="/subjects"
      columns={columns}
      createFields={fields}
      toForm={(r) => ({ ...r, courseId: r.courseId?._id, facultyId: r.facultyId?._id })}
    />
  );
}
