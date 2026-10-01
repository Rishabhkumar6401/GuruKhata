import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, session, setUnauthorizedHandler } from './api.js';

/* ---------------- Auth ---------------- */

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => session.token());
  const [tutor, setTutor] = useState(() => (session.token() ? session.cachedTutor() : null));
  // Bumped on every local profile save, so a slower /api/me started earlier
  // can't put the old name/UPI back (reminders are built from this object).
  const tutorVersion = useRef(0);

  const logout = useCallback(() => {
    session.clear();
    setToken(null);
    setTutor(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setTutor(null);
    });
  }, []);

  // Refresh the tutor profile once per app start (role/plan may change).
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const startedAt = tutorVersion.current;
    api.me()
      .then((r) => {
        if (!alive || !r?.tutor || tutorVersion.current !== startedAt) return;
        setTutor(r.tutor);
        session.save(null, r.tutor);
      })
      .catch(() => { /* 401 handled globally; offline keeps cached tutor */ });
    return () => { alive = false; };
  }, [token]);

  const signIn = useCallback((r) => {
    session.save(r.token, r.tutor);
    setToken(r.token);
    setTutor(r.tutor);
  }, []);

  const updateTutor = useCallback((t) => {
    tutorVersion.current += 1;
    session.save(null, t);
    setTutor(t);
  }, []);

  const value = useMemo(
    () => ({ token, tutor, signIn, logout, updateTutor }),
    [token, tutor, signIn, logout, updateTutor],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/* ---------------- Toast ---------------- */

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  /** show(text, kind?, action?) — action = { label, onClick } adds a button (e.g. Undo). */
  const show = useCallback((text, kind = 'info', action = null) => {
    clearTimeout(timer.current);
    setToast({ text, kind, action, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), kind === 'error' || action ? 5000 : 3000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          onClick={() => setToast(null)}
        >
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={(e) => {
                e.stopPropagation();
                setToast(null);
                toast.action.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
