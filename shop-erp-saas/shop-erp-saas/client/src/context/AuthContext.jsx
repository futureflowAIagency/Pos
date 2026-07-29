import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios.js';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!localStorage.getItem('token')) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data.user);
      setBusiness(data.data.business);
      const list = data.data.branches || [];
      setBranches(list);
      // the server already resolved the right branch (assignedBranch lock, our
      // header, or the main branch as a fallback) — mirror that choice into
      // localStorage so every subsequent request's X-Branch-Id agrees with it
      const resolvedId = data.data.activeBranchId || null;
      if (resolvedId) localStorage.setItem('activeBranchId', String(resolvedId));
      setActiveBranch(list.find((b) => String(b._id) === String(resolvedId)) || null);
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  // Switch the active branch (owner/superadmin, or unrestricted staff only —
  // the server ignores this header entirely for a branch-locked staff login).
  // Every page fetches its own data once on mount, not on branch change, so a
  // full reload is the simplest way to guarantee the whole app reflects the
  // newly selected branch instead of touching every page's data-fetching logic.
  const switchBranch = (branchId) => {
    localStorage.setItem('activeBranchId', String(branchId));
    location.reload();
  };

  useEffect(() => { loadMe(); }, [loadMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.data.token);
    localStorage.removeItem('activeBranchId'); // may belong to a different account's business
    await loadMe();
    return data.data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('token', data.data.token);
    localStorage.removeItem('activeBranchId');
    await loadMe();
    return data.data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeBranchId');
    setUser(null); setBusiness(null); setBranches([]); setActiveBranch(null);
    location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, business, branches, activeBranch, loading, login, register, logout, switchBranch, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}
