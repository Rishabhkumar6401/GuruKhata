import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { digits, inr, phoneDigits, prettyPhone, validPhone } from '../format.js';
import { useToast } from '../state.jsx';
import { ErrorState, Loading, TopBar } from '../components/ui.jsx';

const DEFAULT_DUE_DAY = 5; // matches contract default (flagged there as needing sign-off)

const blank = { name: '', parentName: '', parentPhone: '', subject: '', monthlyFee: '', dueDay: String(DEFAULT_DUE_DAY) };

function toForm(s) {
  return {
    name: s.name || '',
    parentName: s.parentName || '',
    parentPhone: s.parentPhone ? prettyPhone(s.parentPhone) : '',
    subject: s.subject || '',
    monthlyFee: s.monthlyFee != null ? String(s.monthlyFee) : '',
    dueDay: s.dueDay ? String(s.dueDay) : String(DEFAULT_DUE_DAY),
  };
}

const last10 = (p) => digits(p).slice(-10);

function validate(f) {
  const e = {};
  const name = f.name.trim();
  if (!name) e.name = 'Enter the student’s name';
  else if (name.length > 60) e.name = 'Name is too long (max 60)';
  const fee = Number(f.monthlyFee);
  if (f.monthlyFee === '' || !Number.isFinite(fee)) e.monthlyFee = 'Enter the monthly fee';
  else if (fee < 0 || fee > 1000000) e.monthlyFee = 'Fee must be between ₹0 and ₹10,00,000';
  const d = Number(f.dueDay);
  if (!Number.isInteger(d) || d < 1 || d > 28) e.dueDay = 'Pick a day from 1 to 28';
  const ph = phoneDigits(f.parentPhone);
  if (ph && !validPhone(ph)) e.parentPhone = 'Enter a 10-digit mobile number';
  return e;
}

export default function StudentForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();

  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState(isNew ? blank : null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Unpaid fees of this student, loaded when the remove confirm opens:
  // null = checking, { dues: Due[] } = loaded, { dues: [], failed: true } = couldn't check.
  const [unpaid, setUnpaid] = useState(null);
  const [writeOff, setWriteOff] = useState(false); // default: keep fees in Uncollected

  // No GET /students/:id in the contract — load the list (incl. inactive) and pick one.
  useEffect(() => {
    if (isNew) return;
    let alive = true;
    api.students(true)
      .then((r) => {
        if (!alive) return;
        const s = (r?.students || []).find((x) => String(x.id) === id);
        if (!s) { setLoadError('Student not found.'); return; }
        setOrig(s);
        setForm(toForm(s));
      })
      .catch((e) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, [id, isNew]);

  const set = (k) => (ev) => {
    setForm((f) => ({ ...f, [k]: ev.target.value }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function save(ev) {
    ev.preventDefault();
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;

    const body = {
      name: form.name.trim(),
      parentName: form.parentName.trim(),
      parentPhone: phoneDigits(form.parentPhone),
      subject: form.subject.trim(),
      monthlyFee: Number(form.monthlyFee),
      dueDay: Number(form.dueDay),
    };
    setSaving(true);
    try {
      if (isNew) {
        // Optional empty fields are left out on create.
        for (const k of ['parentName', 'parentPhone', 'subject']) if (!body[k]) delete body[k];
        await api.createStudent(body);
        toast(`${body.name} added`);
      } else {
        // Send only what changed; a cleared optional field is sent as null.
        const patch = {};
        const before = toForm(orig);
        for (const k of Object.keys(body)) {
          let was = before[k];
          let now = body[k];
          if (k === 'monthlyFee' || k === 'dueDay') was = Number(was);
          if (k === 'parentPhone') { was = last10(was); now = last10(now); }
          if (now !== was) patch[k] = body[k] === '' ? null : body[k];
        }
        if (Object.keys(patch).length) await api.updateStudent(orig.id, patch);
        toast('Saved');
      }
      navigate('/students', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  }

  async function askRemove() {
    setConfirmRemove(true);
    setWriteOff(false);
    setUnpaid(null);
    try {
      const r = await api.uncollected();
      setUnpaid({ dues: (r?.dues || []).filter((d) => String(d.studentId) === String(orig.id)) });
    } catch {
      // Removing still works; the safe default (keep fees) applies.
      setUnpaid({ dues: [], failed: true });
    }
  }

  const unpaidDues = unpaid?.dues || [];
  const unpaidTotal = unpaidDues.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  async function remove() {
    setRemoving(true);
    try {
      const writingOff = writeOff && unpaidDues.length > 0;
      if (writingOff) {
        // Waive first: if any fails we stop before removing, and a retry is
        // safe (waiving an already-waived fee is a no-op on the server).
        const results = await Promise.allSettled(unpaidDues.map((d) => api.waive(d.id)));
        // 409 = that fee got marked paid meanwhile; nothing left to write off.
        const failed = results.find((x) => x.status === 'rejected' && x.reason?.status !== 409);
        if (failed) throw failed.reason;
      }
      await api.deactivateStudent(orig.id);
      toast(writingOff ? `${orig.name} removed. ${inr(unpaidTotal)} written off.` : `${orig.name} removed`);
      navigate('/students', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setRemoving(false);
    }
  }

  async function restore() {
    setRemoving(true);
    try {
      await api.updateStudent(orig.id, { active: true });
      toast(`${orig.name} is active again`);
      navigate('/students', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setRemoving(false);
    }
  }

  const title = isNew ? 'Add student' : 'Edit student';

  if (loadError) {
    return (
      <main className="screen">
        <TopBar title={title} back="/students" />
        <ErrorState message={loadError} onRetry={() => navigate('/students')} />
      </main>
    );
  }
  if (!form) {
    return (
      <main className="screen">
        <TopBar title={title} back="/students" />
        <Loading />
      </main>
    );
  }

  const inactive = orig && orig.active === false;

  return (
    <main className="screen">
      <TopBar title={title} back="/students" />
      <form className="form" onSubmit={save} noValidate>
        <Field label="Student name" error={errors.name}>
          <input value={form.name} onChange={set('name')} maxLength={60} autoComplete="off"
            placeholder="e.g. Riya Verma" autoFocus={isNew} />
        </Field>
        <Field label="Monthly fee (₹)" error={errors.monthlyFee}>
          <input value={form.monthlyFee} onChange={set('monthlyFee')} inputMode="decimal"
            type="number" min="0" max="1000000" step="any" placeholder="e.g. 1500" />
        </Field>
        <Field label="Fee due on (day of month)" error={errors.dueDay}>
          <select value={form.dueDay} onChange={set('dueDay')}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Parent’s WhatsApp number" hint="Needed to send reminders" error={errors.parentPhone}>
          <input value={form.parentPhone} onChange={set('parentPhone')} type="tel" inputMode="tel"
            autoComplete="off" placeholder="98765 43210" maxLength={16} />
        </Field>
        <Field label="Parent’s name" hint="Optional">
          <input value={form.parentName} onChange={set('parentName')} maxLength={60} autoComplete="off" />
        </Field>
        <Field label="Subject / batch" hint="Optional">
          <input value={form.subject} onChange={set('subject')} maxLength={60} autoComplete="off"
            placeholder="e.g. Class 8 Maths" />
        </Field>

        <div className="bottom-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add student' : 'Save'}
          </button>
        </div>
      </form>

      {!isNew && !inactive && (
        <div className="danger-zone">
          {!confirmRemove ? (
            <button type="button" className="link danger" onClick={askRemove}>
              Remove student
            </button>
          ) : (
            <div className="confirm" role="alertdialog" aria-label="Confirm remove">
              <p className="confirm-text">
                Remove <strong>{orig.name}</strong>? No new fees will be added. Old fees and receipts stay.
              </p>
              {!unpaid ? (
                <p className="hint" role="status">Checking unpaid fees…</p>
              ) : unpaid.failed ? (
                <p className="hint">Could not check unpaid fees. Any unpaid fees will stay in Uncollected.</p>
              ) : unpaidDues.length > 0 && (
                <fieldset className="choices" disabled={removing}>
                  <legend className="confirm-text">
                    <strong>{inr(unpaidTotal)}</strong> is still unpaid
                    ({unpaidDues.length} {unpaidDues.length === 1 ? 'fee' : 'fees'}).
                  </legend>
                  <label className={`choice ${!writeOff ? 'on' : ''}`}>
                    <input type="radio" name="unpaid-fees" checked={!writeOff} onChange={() => setWriteOff(false)} />
                    <span>
                      <span className="choice-title">Keep fees in Uncollected</span>
                      <span className="choice-sub">You can still collect them later.</span>
                    </span>
                  </label>
                  <label className={`choice ${writeOff ? 'on' : ''}`}>
                    <input type="radio" name="unpaid-fees" checked={writeOff} onChange={() => setWriteOff(true)} />
                    <span>
                      <span className="choice-title">Write off {inr(unpaidTotal)}</span>
                      <span className="choice-sub">Marked as not charging (Waived) and removed from Uncollected.</span>
                    </span>
                  </label>
                </fieldset>
              )}
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(false)}
                  disabled={removing}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={removing || !unpaid}>
                  {removing ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {inactive && (
        <div className="danger-zone">
          <p className="hint">This student was removed.</p>
          <button type="button" className="btn btn-ghost btn-block" onClick={restore} disabled={removing}>
            {removing ? 'Saving…' : 'Make active again'}
          </button>
        </div>
      )}
    </main>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">
        {label} {hint && <span className="field-hint">· {hint}</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
