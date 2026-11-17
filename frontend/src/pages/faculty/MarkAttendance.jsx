import AttendanceSheet from '../../components/AttendanceSheet';
import { ErrorNote, PageHeader, Spinner } from '../../components/ui';
import useMySubjects from '../../hooks/useMySubjects';

export default function MarkAttendance() {
  const { subjects, loading, error } = useMySubjects();
  return (
    <div>
      <PageHeader title="Mark attendance" subtitle="Mark a whole class at once. Saving again for the same day updates the existing marks, it never creates duplicates." />
      <div className="panel p-5">
        {loading ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : <AttendanceSheet subjects={subjects} />}
      </div>
    </div>
  );
}
