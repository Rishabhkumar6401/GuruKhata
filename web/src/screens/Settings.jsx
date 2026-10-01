import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { digits, phoneDigits, prettyPhone, validPhone } from '../format.js';
import { useAuth, useToast } from '../state.jsx';

function fromTutor(t) {
  return {
    name: t?.name || '',
    phone: t?.phone ? prettyPhone(t.phone) : '',
    upiId: t?.upiId || '',
    languagePref: t?.languagePref === 'hi' ? 'hi' : 'en',
  };
}

export default function Settings() {
  const { tutor, updateTutor, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => fromTutor(tutor));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Fields the teacher has typed in since they were last seeded/saved. A
  // background /api/me refresh must never overwrite what they are typing.
  const dirty = useRef(new Set());
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });

  // Tutor may refresh from /api/me after mount (or after Save): re-seed only untouched fields.
  useEffect(() => {
    const fresh = fromTutor(tutor);
    setForm((f) => {
      const next = { ...f };
      for (const k of Object.keys(fresh)) if (!dirty.current.has(k)) next[k] = fresh[k];
      return next;
    });
  }, [tutor]);

  const edit = (k, v) => {
    dirty.current.add(k);
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const set = (k) => (e) => edit(k, e.target.value);

  async function save(e) {
    e.preventDefault();
    const errs = {};
    const name = form.name.trim();
    const upi = form.upiId.trim();
    const ph = phoneDigits(form.phone);
    if (!name) errs.name = 'Enter your name';
    if (ph && !validPhone(ph)) errs.phone = 'Enter a 10-digit mobile number';
    if (upi && !/^[A-Za-z0-9._-]{1,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(upi)) errs.upiId = 'Looks wrong. A UPI ID is like name@okhdfcbank';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const before = fromTutor(tutor);
    const patch = {};
    if (name !== before.name) patch.name = name;
    if (ph.slice(-10) !== digits(before.phone).slice(-10)) patch.phone = ph || null;
    if (upi !== before.upiId) patch.upiId = upi || null;
    if (form.languagePref !== before.languagePref) patch.languagePref = form.languagePref;
    if (!Object.keys(patch).length) { toast('Nothing to save'); return; }

    const sent = form;
    setSaving(true);
    try {
      const r = await api.updateMe(patch);
      // Fields still showing what was just sent are clean again, so the saved
      // (normalised) values get seeded back in. Anything typed during the save stays.
      for (const k of [...dirty.current]) if (formRef.current[k] === sent[k]) dirty.current.delete(k);
      if (r?.tutor) updateTutor(r.tutor);
      toast('Saved');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <header className="topbar"><h1>Settings</h1></header>

      <form className="form" onSubmit={save} noValidate>
        <label className={`field ${errors.name ? 'has-error' : ''}`}>
          <span className="field-label">Your name <span className="field-hint">· shown on receipts and reminders</span></span>
          <input value={form.name} onChange={set('name')} maxLength={60} autoComplete="name" />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>

        <label className={`field ${errors.upiId ? 'has-error' : ''}`}>
          <span className="field-label">UPI ID <span className="field-hint">· parents pay you here</span></span>
          <input value={form.upiId} onChange={set('upiId')} autoComplete="off" autoCapitalize="none"
            spellCheck={false} placeholder="yourname@okhdfcbank" maxLength={100} />
          {errors.upiId && <span className="field-error">{errors.upiId}</span>}
        </label>

        <label className={`field ${errors.phone ? 'has-error' : ''}`}>
          <span className="field-label">Your phone</span>
          <input value={form.phone} onChange={set('phone')} type="tel" inputMode="tel"
            autoComplete="tel-national" placeholder="98765 43210" maxLength={16} />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </label>

        <fieldset className="field">
          <legend className="field-label">Reminder language</legend>
          <div className="segmented">
            <button type="button" className={form.languagePref === 'en' ? 'on' : ''}
              aria-pressed={form.languagePref === 'en'}
              onClick={() => edit('languagePref', 'en')}>English</button>
            <button type="button" className={form.languagePref === 'hi' ? 'on' : ''}
              aria-pressed={form.languagePref === 'hi'} lang="hi"
              onClick={() => edit('languagePref', 'hi')}>हिंदी</button>
          </div>
        </fieldset>

        <div className="bottom-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <div className="danger-zone">
        {!confirmLogout ? (
          <button type="button" className="link danger" onClick={() => setConfirmLogout(true)}>Log out</button>
        ) : (
          <div className="confirm" role="alertdialog" aria-label="Confirm log out">
            <p className="confirm-text">Log out of GuruKhata on this phone?</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmLogout(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={logout}>Log out</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
