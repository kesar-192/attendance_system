import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ErrorNote, Field } from '../components/ui';
import { homeFor } from '../components/ProtectedRoute';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signedIn = await login(form.email, form.password);
      const target = location.state?.from;
      navigate(target && target.startsWith(homeFor(signedIn.role)) ? target : homeFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <ClipboardCheck size={22} />
          </span>
          <span className="font-serif text-xl font-semibold">CampusFlow</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight">Every class counted, every shortage caught early.</h1>
          <p className="mt-4 max-w-md text-ink-100/80">Faculty mark a class in seconds or open a QR session. Students see exactly how far they are from the 75% line, subject by subject.</p>
          <div className="mt-10 max-w-sm">
            <div className="relative h-3 rounded-full bg-white/15">
              <div className="h-full w-[68%] rounded-full bg-[#E8A33D]" />
              <span className="absolute -top-1.5 h-6 w-0.5 bg-white" style={{ left: '75%' }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-300">
              <span>68% attended</span>
              <span>75% required</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-ink-300">Accounts are created by your institution's administrator.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h2 className="text-3xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use the email and password issued by your institution.</p>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Email" htmlFor="email">
            <input id="email" type="email" className="input" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" type="password" className="input" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !form.email || !form.password}>
            {busy && <Loader2 size={16} className="animate-spin" />} Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
