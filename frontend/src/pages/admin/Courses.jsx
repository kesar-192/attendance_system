import CrudPage from '../../components/CrudPage';

const fields = [
  { name: 'name', label: 'Course name', required: true, colSpan: 2 },
  { name: 'code', label: 'Course code', required: true, help: 'Letters, digits and hyphens, e.g. BTCS' },
  { name: 'department', label: 'Department', required: true },
  { name: 'durationSemesters', label: 'Duration (semesters)', type: 'number', min: 1, max: 12 },
  { name: 'description', label: 'Description', type: 'textarea', maxLength: 500 }
];

const columns = [
  { key: 'code', label: 'Code', render: (r) => <span className="font-semibold">{r.code}</span> },
  { key: 'name', label: 'Course' },
  { key: 'department', label: 'Department' },
  { key: 'durationSemesters', label: 'Semesters' }
];

export default function Courses() {
  return <CrudPage title="Courses" subtitle="Programmes offered by the institution. Students and subjects belong to a course." noun="course" endpoint="/courses" columns={columns} createFields={fields} />;
}
