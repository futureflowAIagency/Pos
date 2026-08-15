import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';

const DEDUPE_MS = 1500; // ignore the exact same code scanned again within this window
const RECHECK_MS = 20000; // notice a POS-side close/expiry even between scans

// The page a phone opens after scanning a POS "Scan with Phone" QR code. No
// login — access is gated entirely by the session id + token in the URL. Reads
// barcodes/QR/IMEI straight from the camera in-browser (no app install) and
// posts each one back to the POS's scan session.
export default function ScanRemote() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';

  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastRef = useRef({ value: '', at: 0 });

  const [status, setStatus] = useState('checking'); // checking | scanning | invalid | camera-error
  const [businessName, setBusinessName] = useState('');
  const [sent, setSent] = useState([]); // recent submitted codes, newest first

  // Checks the session and reports WHY it might not be usable, distinguishing a
  // genuine server answer from one that never arrived: a real 404 means the
  // server itself says the session is gone (expired, or the POS closed it) —
  // that's final. Anything else (no response at all: a slow/dropped mobile
  // connection, a cold TLS handshake right after opening the link, a brief
  // network blip) is NOT proof the session is invalid, and must not be treated
  // as if it were — a phone's very first request after opening a fresh link is
  // exactly the request most likely to hiccup on a weak signal.
  const checkSession = async () => {
    try {
      const { data } = await api.get(`/scan-sessions/${id}`, { params: { t: token } });
      setBusinessName(data.data.business || '');
      return 'valid';
    } catch (e) {
      return e.response ? 'invalid' : 'network-error';
    }
  };

  // 1) confirm the QR is still valid before ever touching the camera — retries
  // through network errors instead of giving up on the first one.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const tryCheck = async () => {
      const result = await checkSession();
      if (cancelled) return;
      if (result === 'valid') return setStatus('scanning');
      if (result === 'invalid') return setStatus('invalid');
      attempt += 1;
      if (attempt < 5) setTimeout(tryCheck, 1200);
      else setStatus('invalid'); // genuinely can't reach the server after several tries
    };
    tryCheck();
    return () => { cancelled = true; };
  }, [id, token]);

  // 2) periodically re-check so the phone notices the POS closing the session —
  // only a confirmed 'invalid' (or several network errors in a row) ends the
  // session; one missed check on a flaky connection doesn't.
  useEffect(() => {
    if (status !== 'scanning') return;
    let misses = 0;
    const t = setInterval(async () => {
      const result = await checkSession();
      if (result === 'valid') { misses = 0; return; }
      if (result === 'invalid') return setStatus('invalid');
      misses += 1;
      if (misses >= 3) setStatus('invalid');
    }, RECHECK_MS);
    return () => clearInterval(t);
  }, [status, id, token]);

  // 3) start the camera and continuously decode while the session is valid
  useEffect(() => {
    if (status !== 'scanning') return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
      if (stopped || !result) return;
      const value = result.getText();
      const now = Date.now();
      if (value === lastRef.current.value && now - lastRef.current.at < DEDUPE_MS) return;
      lastRef.current = { value, at: now };

      const format = BarcodeFormat[result.getBarcodeFormat()] || '';
      try {
        await api.post(`/scan-sessions/${id}/scans`, { value, format, t: token });
        setSent((list) => [{ value, at: now }, ...list].slice(0, 15));
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (e) {
        if (e.response) {
          // the server itself rejected it — the session really is gone
          setStatus('invalid');
        } else {
          // network blip — this one scan didn't go through, but the camera and
          // session stay live so the next scan can just try again
          toast.error(`"${value}" didn't send — check your connection and try again`);
        }
      }
    }).then((controls) => { if (!stopped) controlsRef.current = controls; else controls.stop(); })
      .catch(() => { setStatus('camera-error'); });

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [status, id, token]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center px-4 py-8">
      <h1 className="text-lg font-semibold mb-1">{businessName || 'Future Flow POS'}</h1>
      <p className="text-sm text-slate-400 mb-4">Remote barcode scan</p>

      {status === 'checking' && <p className="text-slate-400">Checking QR code…</p>}

      {status === 'invalid' && (
        <div className="text-center max-w-xs mt-10">
          <AlertTriangle size={40} className="mx-auto text-amber-400 mb-3" />
          <p className="font-medium">This QR code has expired or was closed.</p>
          <p className="text-sm text-slate-400 mt-2">Go back to the POS and tap "Scan with Phone" again to get a new one.</p>
        </div>
      )}

      {status === 'camera-error' && (
        <div className="text-center max-w-xs mt-10">
          <Camera size={40} className="mx-auto text-red-400 mb-3" />
          <p className="font-medium">Couldn't access the camera.</p>
          <p className="text-sm text-slate-400 mt-2">Allow camera permission for this browser and reload the page.</p>
        </div>
      )}

      {status === 'scanning' && (
        <div className="w-full max-w-sm space-y-4">
          <div className="relative rounded-xl overflow-hidden border-2 border-brand-500 aspect-square bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <p className="text-center text-sm text-slate-400">Point the camera at a barcode, QR code, or IMEI sticker</p>

          {sent.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-3 space-y-1.5 max-h-52 overflow-y-auto">
              {sent.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                  <span className="truncate">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
