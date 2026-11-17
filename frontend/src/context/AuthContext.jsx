import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import client, { TOKEN_KEY, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await client.get('/auth/me');
    setUser(data.data.user);
    setProfile(data.data.profile);
    return data.data;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
  }, [clear]);

  // restore the session after a page reload
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    refresh()
      .catch(clear)
      .finally(() => setLoading(false));
  }, [refresh, clear]);

  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.data.token);
    setUser(data.data.user);
    setProfile(data.data.profile);
    return data.data.user;
  }, []);

  const value = useMemo(() => ({ user, profile, loading, login, logout: clear, refresh }), [user, profile, loading, login, clear, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
