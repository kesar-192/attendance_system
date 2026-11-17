import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, QrCode, Square } from 'lucide-react';
import client, { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorNote } from './ui';

const mmss = (ms) => {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Starts a QR attendance session. The code on screen is a short-lived token that is refreshed
 * automatically, so a photo of the screen stops working within seconds.
 */
export default function QrGenerator({ subjects }) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [session, setSession] = useState(null);
  const [scanned, setScanned] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0]._id);
  }, [subjects, subjectId]);

  const sid = session?.sessionId;
  const token = session?.token;
  const tokenExpiresAt = session?.tokenExpiresAt;

  // rotate the code shortly before it expires
  useEffect(() => {
    if (!sid) return undefined;
    const delay = Math.max(new Date(tokenExpiresAt).getTime() - Date.now() - 5000, 2000);
    const timer = setTimeout(async () => {
      try {
        const { data } = await client.post(`/attendance/qr/${sid}/refresh`);
        setSession((s) => (s && s.sessionId === sid ? { ...s, ...data.data } : s));
      } catch (err) {
        if (err.response?.status === 410) {
          setEnded(true);
          setSession(null);
        } else {
          setError(errorMessage(err));
        }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [sid, token, tokenExpiresAt]);

  // live scan counter + clock
  useEffect(() => {
    if (!sid) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const { data } = await client.get(`/attendance/qr/${sid}`);
        setScanned(data.data.scanned);
        if (!data.data.active) {
          setEnded(true);
          setSession(null);
        }
      } catch {
        /* transient network errors are ignored; the next poll retries */
      }
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [sid]);

  async function start() {
    setBusy(true);
    setError('');
    setEnded(false);
    try {
      const { data } = await client.post('/attendance/qr/generate', { subjectId, durationMinutes: Number(minutes) });
      setSession(data.data);
      setScanned(0);
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    try {
      await client.post(`/attendance/qr/${sid}/close`);
      toast.success(`Session closed. ${scanned} student(s) marked present by QR.`);
    } catch (err) {
      toast.fromError(err);
    }
    setSession(null);
  }

  if (subjects.length === 0) return <EmptyState title="No subjects assigned" text="You need an assigned subject to open a QR session." />;

  if (session) {
    return (
      <div className="flex flex-col items-center text-center">
        <p className="font-semibold">
          {session.subject.code} - {session.subject.name}
        </p>
        <div className="my-4 rounded-xl border border-line bg-white p-4">
          <QRCodeSVG value={session.token} size={256} level="M" marginSize={1} />
        </div>
        <p className="text-sm text-muted">Students scan this from the CampusFlow app. The code changes every {session.rotateSeconds} seconds.</p>
        <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-3">
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Session ends in</p>
            <p className="font-serif text-2xl font-semibold tabular-nums">{mmss(new Date(session.expiresAt).getTime() - now)}</p>
          </div>
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Marked present</p>
            <p className="font-serif text-2xl font-semibold tabular-nums">{scanned}</p>
          </div>
        </div>
        {error && (
          <div className="mt-3 w-full">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        <button type="button" className="btn-danger mt-5" onClick={stop}>
          <Square size={16} /> End session
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ended && <p className="rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">The last QR session has ended. Start a new one to keep marking attendance.</p>}
      <ErrorNote>{error}</ErrorNote>
      <div>
        <label className="label" htmlFor="qr-subject">
          Subject
        </label>
        <select id="qr-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s._id} value={s._id}>
              {s.code} - {s.name} (Sem {s.semester})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="qr-minutes">
          Session length
        </label>
        <select id="qr-minutes" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
          {[5, 10, 15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn-primary w-full" onClick={start} disabled={busy || !subjectId}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />} Start QR session
      </button>
      <p className="text-xs text-muted">Students who scan are marked present for today. Anyone you have already marked manually is left unchanged.</p>
    </div>
  );
}
