import { useRef, useState } from 'react';
import { CheckCircle2, Info, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';
import client, { errorMessage } from '../../api/client';
import QrScanner from '../../components/QrScanner';
import { Field, PageHeader } from '../../components/ui';

const RESULT_STYLE = {
  success: { box: 'border-healthy/30 bg-healthy-soft text-healthy', Icon: CheckCircle2 },
  info: { box: 'border-brand/30 bg-brand-soft text-brand-dark', Icon: Info },
  error: { box: 'border-shortage/30 bg-shortage-soft text-shortage', Icon: TriangleAlert }
};

export default function ScanQr() {
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const inFlight = useRef(false);

  async function submit(token) {
    if (inFlight.current || !token) return;
    inFlight.current = true;
    setScanning(false);
    setBusy(true);
    try {
      const { data } = await client.post('/attendance/qr/scan', { token: token.trim() });
      setResult({ type: data.data.alreadyMarked ? 'info' : 'success', message: data.message });
    } catch (err) {
      setResult({ type: 'error', message: errorMessage(err) });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  function reset() {
    setResult(null);
    setManual('');
    setScanning(true);
  }

  const style = result && RESULT_STYLE[result.type];
  return (
    <div>
      <PageHeader title="Scan attendance QR" subtitle="Point your camera at the code your faculty is showing. It changes every few seconds, so scan it while it is on screen." />
      <div className="panel mx-auto max-w-md p-5">
        {!result && !busy && <QrScanner active={scanning} onScan={submit} />}
        {busy && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
            <Loader2 className="animate-spin" size={20} /> Marking your attendance
          </div>
        )}
        {result && (
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${style.box}`} role="status">
            <style.Icon size={22} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{result.type === 'error' ? 'Not marked' : 'Done'}</p>
              <p className="text-sm">{result.message}</p>
            </div>
          </div>
        )}
        {result && (
          <button type="button" className="btn-secondary mt-4 w-full" onClick={reset}>
            <RotateCcw size={16} /> Scan another code
          </button>
        )}

        <form
          className="mt-6 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(manual);
          }}
        >
          <Field label="No camera? Paste the code" htmlFor="manual-token" help="Your faculty can share the code text with you.">
            <input id="manual-token" className="input" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
          </Field>
          <button type="submit" className="btn-secondary mt-3 w-full" disabled={!manual.trim() || busy}>
            Mark my attendance
          </button>
        </form>
      </div>
    </div>
  );
}
