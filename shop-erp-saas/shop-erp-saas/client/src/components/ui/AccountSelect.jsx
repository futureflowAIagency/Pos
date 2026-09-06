import { useEffect, useState } from 'react';
import api from '../../api/axios.js';

// Optional "which named account" picker shown next to a payment-method select
// once bank/bKash/Nagad/Rocket/card is chosen — the shop's 5-10 real bank
// accounts (Settings → Payment Accounts) are named so an owner can tell which
// one a sale/expense/due-collection actually moved through. Renders nothing
// for cash (there's only one till) or once a method has no accounts set up.
export default function AccountSelect({ method, value, onChange, className = '' }) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    if (!method || method === 'cash') { setAccounts([]); return; }
    let cancelled = false;
    api.get('/payment-accounts', { params: { method, activeOnly: 'true' } })
      .then(({ data }) => { if (!cancelled) setAccounts(data.data.accounts); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, [method]);

  if (!method || method === 'cash' || accounts.length === 0) return null;

  return (
    <select className={`input ${className}`} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— General {method} —</option>
      {accounts.map((a) => (
        <option key={a._id} value={a._id}>{a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}</option>
      ))}
    </select>
  );
}
