import QrGenerator from '../../components/QrGenerator';
import { ErrorNote, PageHeader, Spinner } from '../../components/ui';
import useMySubjects from '../../hooks/useMySubjects';

export default function QrSession() {
  const { subjects, loading, error } = useMySubjects();
  return (
    <div>
      <PageHeader title="QR attendance" subtitle="Project the code in class. Students scan it with their own account to mark themselves present." />
      <div className="panel mx-auto max-w-lg p-6">{loading ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : <QrGenerator subjects={subjects} />}</div>
    </div>
  );
}
