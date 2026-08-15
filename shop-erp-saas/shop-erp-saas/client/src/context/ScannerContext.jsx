import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import api from '../api/axios.js';

const ScannerContext = createContext(null);

// A persistent, app-wide "connected phone scanner" — connect once (from the
// Topbar, on any page) and it stays connected while navigating anywhere, until
// explicitly disconnected. No timeout while in use: the server renews the
// connection on every poll (see scanSessionController.js), so this behaves like
// a physical USB/Bluetooth scanner staying paired, not a one-off QR popup.
//
// Any page subscribes to receive each newly-scanned code and decides what to do
// with it there (POS adds it to the cart, Products resolves it as a product
// barcode for stock entry, etc.) — the same role a hardware scanner already
// plays for those pages, just fed over a phone instead of a USB cable.
export function ScannerProvider({ children }) {
  const [session, setSession] = useState(null); // { sessionId, token }
  const [connecting, setConnecting] = useState(false);
  const [qr, setQr] = useState('');
  const [itemsScanned, setItemsScanned] = useState(0);
  const subscribers = useRef(new Set());

  // A page registers to receive scanned codes while it's mounted; returns the
  // unsubscribe function for the effect cleanup.
  const subscribe = useCallback((cb) => {
    subscribers.current.add(cb);
    return () => subscribers.current.delete(cb);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { data } = await api.post('/scan-sessions');
      const { sessionId, token, url } = data.data;
      setItemsScanned(0);
      setSession({ sessionId, token });
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 260 }));
    } catch (e) { toast.error(e.response?.data?.message || 'Could not connect the scanner'); }
    setConnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    setSession((s) => {
      if (s) api.delete(`/scan-sessions/${s.sessionId}`).catch(() => {});
      return null;
    });
    setQr('');
  }, []);

  // Poll for newly-submitted scans while connected. `consume=true` tells the
  // server to hand over pending scans and clear them immediately, so nothing
  // needs to be tracked/de-duped client-side even across a very long-lived
  // connection. Only a confirmed 404 (server says the session is really gone)
  // disconnects — a single dropped poll on a flaky connection does not.
  useEffect(() => {
    if (!session) return;
    let misses = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/scan-sessions/${session.sessionId}`, { params: { t: session.token, consume: true } });
        misses = 0;
        for (const s of data.data.scans) {
          setItemsScanned((n) => n + 1);
          subscribers.current.forEach((cb) => cb(s.value));
        }
      } catch (e) {
        if (e.response || ++misses >= 3) {
          toast.error('Phone scanner disconnected');
          setSession(null);
          setQr('');
        }
      }
    };
    const t = setInterval(poll, 700);
    return () => clearInterval(t);
  }, [session]);

  const value = { connected: !!session, connecting, qr, itemsScanned, connect, disconnect, subscribe };
  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
}

// Safe to call even where no provider is mounted (e.g. a stray page outside
// Layout) — returns a harmless no-op shape instead of throwing.
const noop = { connected: false, connecting: false, qr: '', itemsScanned: 0, connect: async () => {}, disconnect: () => {}, subscribe: () => () => {} };
export const useScanner = () => useContext(ScannerContext) || noop;
