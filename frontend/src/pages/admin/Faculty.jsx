import CrudPage from '../../components/CrudPage';
import { Badge } from '../../components/ui';

const base = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'employeeId', label: 'Employee ID', required: true },
  { name: 'department', label: 'Department', required: true },
  { name: 'designation', label: 'Designation' },
  { name: 'phone', label: 'Phone' }
];

const createFields = [{ name: 'password', label: 'Temporary password', type: 'password', required: true, help: '8+ characters with a letter and a number' }, ...base];
const editFields = [{ name: 'password', label: 'Reset password', type: 'password', help: 'Leave blank to keep the current password' }, ...base];

const columns = [
  { key: 'employeeId', label: 'Employee ID', render: (r) => <span className="font-semibold">{r.employeeId}</span> },
  { key: 'name', label: 'Name', render: (r) => r.userId?.name },
  { key: 'email', label: 'Email', render: (r) => r.userId?.email },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'status', label: 'Account', render: (r) => (r.userId?.isActive ? <Badge tone="healthy">Active</Badge> : <Badge tone="shortage">Disabled</Badge>) }
];

export default function FacultyPage() {
  return (
    <CrudPage
      title="Faculty"
      subtitle="Faculty accounts. A faculty member who still teaches subjects cannot be deleted."
      noun="faculty member"
      endpoint="/faculty"
      columns={columns}
      createFields={createFields}
      editFields={editFields}
      searchPlaceholder="Search by name, email or employee ID"
      toForm={(r) => ({ name: r.userId?.name, email: r.userId?.email, employeeId: r.employeeId, department: r.department, designation: r.designation, phone: r.phone })}
    />
  );
}
