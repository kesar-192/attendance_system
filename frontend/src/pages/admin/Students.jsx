import CrudPage from '../../components/CrudPage';
import { Badge } from '../../components/ui';

const base = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'enrollmentNo', label: 'Enrollment number', required: true, help: 'Must be unique, e.g. BCA2024001' },
  { name: 'courseId', label: 'Course', type: 'select', required: true, optionsFrom: { url: '/courses', label: (c) => `${c.name} (${c.code})`, value: (c) => c._id } },
  { name: 'semester', label: 'Semester', type: 'number', required: true, min: 1, max: 12 },
  { name: 'phone', label: 'Phone' }
];

const createFields = [{ name: 'password', label: 'Temporary password', type: 'password', required: true, help: '8+ characters with a letter and a number' }, ...base];
const editFields = [{ name: 'password', label: 'Reset password', type: 'password', help: 'Leave blank to keep the current password' }, ...base];

const columns = [
  { key: 'enrollmentNo', label: 'Enrollment', render: (r) => <span className="font-semibold">{r.enrollmentNo}</span> },
  { key: 'name', label: 'Name', render: (r) => r.userId?.name },
  { key: 'email', label: 'Email', render: (r) => r.userId?.email },
  { key: 'course', label: 'Course', render: (r) => r.courseId?.code },
  { key: 'semester', label: 'Sem' },
  { key: 'status', label: 'Account', render: (r) => (r.userId?.isActive ? <Badge tone="healthy">Active</Badge> : <Badge tone="shortage">Disabled</Badge>) }
];

export default function Students() {
  return (
    <CrudPage
      title="Students"
      subtitle="Create student accounts and manage their course and semester."
      noun="student"
      endpoint="/students"
      columns={columns}
      createFields={createFields}
      editFields={editFields}
      searchPlaceholder="Search by name, email or enrollment no."
      toForm={(r) => ({ name: r.userId?.name, email: r.userId?.email, enrollmentNo: r.enrollmentNo, courseId: r.courseId?._id, semester: r.semester, phone: r.phone })}
    />
  );
}
