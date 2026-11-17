import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import client, { TOKEN_KEY, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ErrorNote, Field, PageHeader } from '../../components/ui';

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value || '-'}</dd>
    </div>
  );
}

export default function Profile() {
  const { user, profile, refresh } = useAuth();
  const toast = useToast();
  const editable = user.role === 'student' || user.role === 'faculty';
  const endpoint = user.role === 'student' ? '/students/me' : '/faculty/me';

  const [form, setForm] = useState({ name: user.name, phone: profile?.phone || '', extra: (user.role === 'student' ? profile?.address : profile?.designation) || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    setForm({ name: user.name, phone: profile?.phone || '', extra: (user.role === 'student' ? profile?.address : profile?.designation) || '' });
  }, [user, profile]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = { name: form.name, phone: form.phone || undefined };
    body[user.role === 'student' ? 'address' : 'designation'] = form.extra || undefined;
    try {
      await client.patch(endpoint, body);
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwBusy(true);
    setPwError('');
    try {
      const { data } = await client.post('/auth/change-password', pw);
      localStorage.setItem(TOKEN_KEY, data.data.token); // the old token is revoked by the password change
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="My profile" subtitle="Your account details and password." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-2 text-xl font-semibold">Account</h2>
          <dl>
            <Row label="Name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={<span className="capitalize">{user.role}</span>} />
            {user.role === 'student' && (
              <>
                <Row label="Enrollment number" value={profile?.enrollmentNo} />
                <Row label="Course" value={profile?.courseId?.name} />
                <Row label="Semester" value={profile?.semester} />
              </>
            )}
            {user.role === 'faculty' && (
              <>
                <Row label="Employee ID" value={profile?.employeeId} />
                <Row label="Department" value={profile?.department} />
              </>
            )}
          </dl>
        </section>

        {editable && (
          <form onSubmit={saveProfile} className="panel space-y-4 p-5">
            <h2 className="text-xl font-semibold">Contact details</h2>
            <ErrorNote>{error}</ErrorNote>
            <Field label="Full name" htmlFor="p-name">
              <input id="p-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="p-phone">
              <input id="p-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={user.role === 'student' ? 'Address' : 'Designation'} htmlFor="p-extra">
              <input id="p-extra" className="input" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
            </Field>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />} Save changes
            </button>
          </form>
        )}

        <form onSubmit={changePassword} className="panel space-y-4 p-5">
          <h2 className="text-xl font-semibold">Change password</h2>
          <ErrorNote>{pwError}</ErrorNote>
          <Field label="Current password" htmlFor="pw-current">
            <input id="pw-current" type="password" className="input" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="pw-new" help="8+ characters with a letter and a number">
            <input id="pw-new" type="password" className="input" required autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <button type="submit" className="btn-primary" disabled={pwBusy}>
            {pwBusy && <Loader2 size={16} className="animate-spin" />} Update password
          </button>
        </form>
      </div>
    </div>
  );
}
