import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
// The name-only Dev login form exists for `npm run dev` and for builds that opt
// in with VITE_ALLOW_DEV_LOGIN=1 (dev/staging only). Production never shows it;
// vite.config.js also refuses a production build without the real env vars.
const DEV_LOGIN_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === '1';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    const s = existing || document.createElement('script');
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Could not load Google sign-in. Check your internet.')));
    if (!existing) {
      s.src = GSI_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export default function Login() {
  const { signIn } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="screen login">
      <div className="login-top">
        <img src="/icons/icon.svg" alt="" width="56" height="56" className="login-logo" />
        <h1 className="brand big">Guru<span>Khata</span></h1>
        <p className="login-lead">Your tuition fees register. See who has paid, remind parents on WhatsApp, send receipts.</p>
      </div>

      <div className="login-box">
        {GOOGLE_CLIENT_ID ? (
          <GoogleButton signIn={signIn} setError={setError} busy={busy} setBusy={setBusy} />
        ) : DEV_LOGIN_ALLOWED ? (
          <DevLogin signIn={signIn} setError={setError} busy={busy} setBusy={setBusy} />
        ) : (
          <SignInUnavailable />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

function GoogleButton({ signIn, setError, busy, setBusy }) {
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    loadGsi()
      .then(() => {
        if (!alive || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setError('');
            setBusy(true);
            try {
              signIn(await api.loginGoogle(credential));
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: Math.min(320, ref.current.offsetWidth || 320),
        });
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [signIn, setError, setBusy]);

  return (
    <>
      <div ref={ref} className="gsi-slot" aria-busy={busy} />
      {busy && <p className="hint center">Signing in…</p>}
    </>
  );
}

function DevLogin({ signIn, setError, busy, setBusy }) {
  const [name, setName] = useState('');

  async function submit(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError('Enter a name'); return; }
    setError('');
    setBusy(true);
    try {
      signIn(await api.loginDev(n));
    } catch (err) {
      if (err.status === 404) {
        // Operator hint goes to the console, never into the UI.
        console.warn('[gurukhata] POST /api/auth/dev returned 404: start the API with DEV_AUTH=1 to enable Dev login.');
        setError('Dev login is turned off on the server.');
      } else {
        setError(err.message);
      }
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="dev-tag">Dev login · no Google client ID set</p>
      <label className="field">
        <span className="field-label">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          autoComplete="name" placeholder="e.g. Sunita Sharma" />
      </label>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Signing in…' : 'Continue'}
      </button>
    </form>
  );
}

/** Misconfigured build (no Google client ID, Dev login not allowed). */
function SignInUnavailable() {
  useEffect(() => {
    console.error('[gurukhata] Sign-in is not configured: VITE_GOOGLE_CLIENT_ID is empty in this build '
      + 'and Dev login is off (set VITE_ALLOW_DEV_LOGIN=1 for dev/staging builds only).');
  }, []);
  return <p className="form-error" role="alert">Sign-in is not available right now. Please try again later.</p>;
}
