import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildWaLink, reminderMessage } from '../../../shared/templates.js';
import { api } from '../api.js';
import { inr, monthLabel, MODES, reminderMonthLabel } from '../format.js';
import { useAuth, useToast } from '../state.jsx';
import { Sheet, StatusPill } from './ui.jsx';

export function receiptPath(due) {
  return `/receipt/${encodeURIComponent(due.id)}?month=${encodeURIComponent(due.month)}`;
}

export function DueRow({ due, showMonth, onRemind, onPay, onUnwaive, reminding, undoing }) {
  const navigate = useNavigate();
  const paid = due.status === 'paid';
  const open = due.status === 'due';
  const waived = due.status === 'waived';

  return (
    <li className={`row due-row ${paid ? 'is-paid' : ''} ${waived ? 'is-waived' : ''}`}>
      <div
        className={`row-main ${paid ? 'tappable' : ''}`}
        onClick={paid ? () => navigate(receiptPath(due), { state: { due } }) : undefined}
        role={paid ? 'button' : undefined}
        tabIndex={paid ? 0 : undefined}
        onKeyDown={paid ? (e) => { if (e.key === 'Enter') navigate(receiptPath(due), { state: { due } }); } : undefined}
      >
        <div className="row-text">
          <div className="row-title">{due.studentName}</div>
          <div className="row-sub">
            {[showMonth ? monthLabel(due.month) : null, due.subject].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
        <div className="row-end">
          <div className="row-amount">{inr(due.amount)}</div>
          <StatusPill due={due} />
        </div>
      </div>

      {open && (
        <div className="row-actions">
          {due.parentPhone ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemind(due)}
              disabled={reminding}>
              {reminding ? 'Opening…' : 'Remind'}
            </button>
          ) : (
            <Link className="btn btn-ghost btn-sm" to={`/students/${encodeURIComponent(due.studentId)}`}>
              Add number
            </Link>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPay(due)}>
            Mark paid
          </button>
        </div>
      )}
      {paid && (
        <div className="row-note">
          <button type="button" className="link" onClick={() => navigate(receiptPath(due), { state: { due } })}>
            View receipt {due.receiptNo ? `· ${due.receiptNo}` : ''}
          </button>
        </div>
      )}
      {waived && onUnwaive && (
        <div className="row-note">
          <button type="button" className="link quiet" onClick={() => onUnwaive(due)} disabled={undoing}>
            {undoing ? 'Undoing…' : 'Undo — charge this fee'}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Remind / Mark paid / Not charging behaviour shared by the Dues and
 * Uncollected screens. `setDues` receives an updater fn (list => list) for
 * optimistic updates; `onChanged` (optional) runs after a waive or its undo so
 * the screen can refresh server-computed totals.
 */
export function useDueActions(setDues, onChanged) {
  const toast = useToast();
  const navigate = useNavigate();
  const { tutor } = useAuth();
  const [remindingId, setRemindingId] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [step, setStep] = useState('pay'); // 'pay' | 'waive' (the in-sheet confirm)
  const [busy, setBusy] = useState(false);
  const remindTimer = useRef(null);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; });
  useEffect(() => () => clearTimeout(remindTimer.current), []);

  const patchDue = useCallback(
    (id, fn) => setDues((list) => list.map((d) => (d.id === id ? fn(d) : d))),
    [setDues],
  );

  /**
   * Opens WhatsApp SYNCHRONOUSLY inside the tap: Android drops the tap's user
   * activation if we wait on the network first (~5 s), and then WhatsApp won't
   * open. The message is built here with the same shared template + month label
   * as the API; the reminder is logged in the background (keepalive) and its
   * result is ignored.
   */
  const remind = useCallback((due) => {
    if (!due.parentPhone) return; // the row shows "Add number" instead
    clearTimeout(remindTimer.current);
    setRemindingId(due.id);

    if (!tutor) {
      // Profile not loaded yet (rare): let the API build the message.
      api.remind(due.id)
        .then((r) => {
          if (!r?.waLink) throw new Error('Could not build the WhatsApp message.');
          window.location.href = r.waLink;
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => setRemindingId(null));
      return;
    }
    const lang = tutor.languagePref === 'hi' ? 'hi' : 'en';
    const message = reminderMessage(
      {
        studentName: due.studentName,
        monthLabel: reminderMonthLabel(due.month, lang),
        amount: Number(due.amount),
        upiId: tutor.upiId,
        teacherName: tutor.name || '',
      },
      lang,
    );
    const waLink = buildWaLink(due.parentPhone, message);
    api.logReminder(due.id, lang);
    // Same-tab navigation; on Android the wa.me link hands off to the WhatsApp app.
    window.location.href = waLink;
    // The page usually stays alive behind WhatsApp: re-enable the button
    // shortly (also stops a double tap from opening it twice).
    remindTimer.current = setTimeout(() => setRemindingId(null), 2000);
  }, [tutor, toast]);

  const startPay = useCallback((due) => {
    setStep('pay');
    setPayTarget(due);
  }, []);
  const closePay = useCallback(() => setPayTarget(null), []);

  const pay = useCallback(async (mode) => {
    const due = payTarget;
    if (!due) return;
    setBusy(true);
    patchDue(due.id, (d) => ({ ...d, status: 'paid', overdue: false, paymentMode: mode })); // optimistic
    try {
      const r = await api.pay(due.id, mode);
      patchDue(due.id, () => r.due); // reconcile with server truth
      setPayTarget(null);
      navigate(receiptPath(r.due), { state: { due: r.due, justPaid: true } });
    } catch (e) {
      patchDue(due.id, () => due); // roll back
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [payTarget, patchDue, navigate, toast]);

  /** Undo a waive: POST /unpay puts it back to 'due'. */
  const unwaive = useCallback(async (due) => {
    setUndoingId(due.id);
    try {
      const r = await api.unpay(due.id);
      patchDue(due.id, () => r.due);
      toast('Fee is back in Uncollected');
      onChangedRef.current?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUndoingId(null);
    }
  }, [patchDue, toast]);

  const waive = useCallback(async () => {
    const due = payTarget;
    if (!due) return;
    setBusy(true);
    try {
      const r = await api.waive(due.id);
      patchDue(due.id, () => r.due);
      setPayTarget(null);
      toast(`Not charging ${due.studentName} for ${monthLabel(due.month)}`, 'info',
        { label: 'Undo', onClick: () => unwaive(r.due) });
      onChangedRef.current?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [payTarget, patchDue, toast, unwaive]);

  const confirmingWaive = step === 'waive';
  const sheet = (
    <Sheet open={!!payTarget} onClose={closePay} busy={busy}
      title={confirmingWaive ? 'Not charging this fee?' : 'Mark as paid'}>
      {payTarget && (
        <>
          <div className="sheet-summary">
            <div>
              <div className="row-title">{payTarget.studentName}</div>
              <div className="row-sub">{monthLabel(payTarget.month, true)}</div>
            </div>
            <div className="sheet-amount">{inr(payTarget.amount)}</div>
          </div>
          {!confirmingWaive ? (
            <>
              <p className="sheet-label">How was it paid?</p>
              <div className="mode-grid">
                {MODES.map((m) => (
                  <button key={m.value} type="button" className="btn btn-mode" disabled={busy}
                    onClick={() => pay(m.value)}>
                    {m.label}
                  </button>
                ))}
              </div>
              {busy && <p className="hint center">Saving…</p>}
              <button type="button" className="btn btn-text btn-block" onClick={closePay} disabled={busy}>
                Cancel
              </button>
              <div className="sheet-foot">
                <button type="button" className="link quiet" onClick={() => setStep('waive')} disabled={busy}>
                  Not charging this fee?
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="sheet-text">
                Use this if {payTarget.studentName} left, or you are not charging
                for {monthLabel(payTarget.month, true)}. The fee leaves Uncollected and no receipt
                is made. You can undo it later.
              </p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('pay')} disabled={busy}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={waive} disabled={busy}>
                  {busy ? 'Saving…' : 'Not charging'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );

  return { remind, startPay, unwaive, remindingId, undoingId, sheet };
}
