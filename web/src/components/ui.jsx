import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * In-app "back": pop the real history entry when this app pushed one (so the
 * phone's Back button stays in step), else — deep link / fresh tab — replace
 * the current entry with the parent route. Never pushes a new entry.
 * React Router keeps its own entry index in history.state.idx (0 = first page).
 */
export function useGoBack(parent = '/') {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate(parent, { replace: true });
  }, [navigate, parent]);
}

/** `back`: parent route to fall back to (string), or true for '/'. */
export function TopBar({ title, back, right }) {
  const goBack = useGoBack(typeof back === 'string' ? back : '/');
  return (
    <header className="topbar">
      {back && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={goBack}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <h1>{title}</h1>
      {right && <div className="topbar-right">{right}</div>}
    </header>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state">
      <p className="state-text">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}

export function Empty({ title, text, children }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {text && <p className="state-text">{text}</p>}
      {children}
    </div>
  );
}

export function StatusPill({ due }) {
  if (due.status === 'paid') return <span className="pill pill-paid">Paid</span>;
  if (due.status === 'waived') return <span className="pill pill-waived">Waived</span>;
  if (due.overdue) return <span className="pill pill-overdue">Overdue</span>;
  return <span className="pill pill-due">Due</span>;
}

/** Bottom sheet. Closes on backdrop tap or Escape (unless busy). */
export function Sheet({ open, onClose, title, children, busy }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
