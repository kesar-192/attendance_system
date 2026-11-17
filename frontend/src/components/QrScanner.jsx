import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff } from 'lucide-react';

const REGION_ID = 'campusflow-qr-reader';

/** Camera based QR reader. Calls onScan(text) for every decoded code while `active` is true. */
export default function QrScanner({ active, onScan }) {
  const [error, setError] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return undefined;
    setError('');
    const scanner = new Html5Qrcode(REGION_ID);
    let started = false;
    let cancelled = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => onScanRef.current(text),
        () => {}
      )
      .then(() => {
        started = true;
        if (cancelled) scanner.stop().then(() => scanner.clear()).catch(() => {});
      })
      .catch((err) => !cancelled && setError(typeof err === 'string' ? err : err?.message || 'Camera could not be started'));

    return () => {
      cancelled = true;
      if (started) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [active]);

  return (
    <div>
      <div id={REGION_ID} className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl bg-ink/90" />
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">
          <CameraOff size={18} className="mt-0.5 shrink-0" />
          <span>Camera unavailable: {error}. Allow camera access in your browser, or paste the code below.</span>
        </p>
      )}
    </div>
  );
}
