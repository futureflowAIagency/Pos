import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Spinner from '../ui/Spinner.jsx';
import { useScanner } from '../../context/ScannerContext.jsx';

// Topbar control for the persistent phone-scanner connection — connect once,
// stays connected on every page (Layout mounts the provider above the Outlet),
// until explicitly disconnected. See ScannerContext.jsx for how it works.
export default function ScannerWidget() {
  const { connected, connecting, qr, itemsScanned, connect, disconnect } = useScanner();
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (connected) { setOpen(true); return; }
    connect().then(() => setOpen(true));
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={connecting}
        className={`btn-ghost p-2 flex items-center gap-1.5 ${connected ? 'text-green-600' : ''}`}
        title={connected ? 'Phone scanner connected' : 'Connect a phone as a scanner'}
      >
        <Smartphone size={18} />
        {connected && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Phone Scanner">
        <div className="flex flex-col items-center gap-3 text-center">
          {connecting ? (
            <Spinner />
          ) : connected ? (
            <>
              {qr && <img src={qr} alt="Scan this with your phone" className="rounded-lg border border-slate-200 dark:border-slate-700" />}
              <p className="text-sm text-slate-500">
                Open your phone's camera and point it at this QR code — no app to install.
                Once scanned, every barcode/IMEI you scan on your phone works here just like a
                regular scanner: adds to the cart on POS, or looks up/adds stock on Products.
              </p>
              <p className="text-xs text-slate-400">Stays connected while in use — no timeout. Works on any page until you disconnect.</p>
              {itemsScanned > 0 && (
                <p className="text-sm font-medium text-brand-600">{itemsScanned} item{itemsScanned > 1 ? 's' : ''} scanned this session</p>
              )}
              <button className="btn-ghost text-red-500" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Could not connect. Try again from the scanner icon.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
