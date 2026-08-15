import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
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

  const checkSession = async () => {
    try {
      const { data } = await api.get(`/scan-sessions/${id}`, { params: { t: token } });
      setBusinessName(data.data.business || '');
      return true;
    } catch {
      return false;
    }
  };

  // 1) confirm the QR is still valid before ever touching the camera
  useEffect(() => {
    let cancelled = false;
    checkSession().then((valid) => { if (!cancelled) setStatus(valid ? 'scanning' : 'invalid'); });
    return () => { cancelled = true; };
  }, [id, token]);

  // 2) periodically re-check so the phone notices the POS closing the session
  useEffect(() => {
    if (status !== 'scanning') return;
    const t = setInterval(async () => {
      const valid = await checkSession();
      if (!valid) setStatus('invalid');
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
      } catch {
        setStatus('invalid');
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
