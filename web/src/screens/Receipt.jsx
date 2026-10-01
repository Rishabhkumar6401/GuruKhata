import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { inr, isMonth, monthLabel } from '../format.js';
import { canvasToBlob, drawReceipt } from '../receipt.js';
import { useAuth, useToast } from '../state.jsx';
import { Empty, ErrorState, Loading, TopBar, useGoBack } from '../components/ui.jsx';

export default function Receipt() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { tutor } = useAuth();

  // History state is ONLY an instant placeholder while we re-check the server.
  // It can be stale (e.g. phone Back after "Undo — not paid"), so it never
  // unlocks Share or Undo on its own.
  const fromState = location.state?.due;
  const placeholder = fromState && String(fromState.id) === id && fromState.status === 'paid' ? fromState : null;
  const qMonth = params.get('month');
  const month = isMonth(qMonth) ? qMonth : isMonth(placeholder?.month) ? placeholder.month : null;
  const backTo = month ? `/?month=${month}` : '/';
  const goBack = useGoBack(backTo);

  // loading | paid (confirmed by the server) | not-paid | not-found | error
  const [check, setCheck] = useState({ state: 'loading' });
  const [reload, setReload] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  // Always re-check: no single-due endpoint in the contract, so find it in its month.
  // location.key is a dependency so every visit to this entry refetches.
  useEffect(() => {
    if (!month) { setCheck({ state: 'not-found' }); return; }
    let alive = true;
    setCheck({ state: 'loading' });
    api.dues(month)
      .then((r) => {
        if (!alive) return;
        const found = (r?.dues || []).find((d) => String(d.id) === id);
        if (!found) setCheck({ state: 'not-found' });
        else if (found.status !== 'paid') setCheck({ state: 'not-paid' });
        else setCheck({ state: 'paid', due: found });
      })
      .catch((e) => alive && setCheck({ state: 'error', message: e.message }));
    return () => { alive = false; };
  }, [id, month, reload, location.key]);

  const confirmed = check.state === 'paid';
  const due = confirmed ? check.due : check.state === 'loading' ? placeholder : null;

  useEffect(() => {
    if (due && canvasRef.current) drawReceipt(canvasRef.current, { due, tutorName: tutor?.name });
  }, [due, tutor?.name]);

  const fileName = `receipt-${due?.receiptNo || id}.png`;

  function download(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setNote('Receipt saved to your phone. In WhatsApp, attach it from Gallery or Files.');
  }

  async function share() {
    if (!confirmed) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (!blob) { toast('Could not make the image.', 'error'); return; }
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Fee receipt' });
      } catch (e) {
        if (e?.name !== 'AbortError') download(blob);
      }
    } else {
      download(blob);
    }
  }

  async function undo() {
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.unpay(due.id);
      toast('Marked as not paid');
      // Pop this entry (the list behind it refetches) rather than pushing a new one.
      goBack();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  }

  // Leaving a dead receipt: replace it so Back can't land on it again.
  const toDues = () => navigate(backTo, { replace: true });

  if (check.state === 'not-paid' || check.state === 'not-found') {
    return (
      <main className="screen">
        <TopBar title="Receipt" back={backTo} />
        <Empty
          title={check.state === 'not-paid' ? 'This fee is not marked paid' : 'Receipt not found'}
          text={check.state === 'not-paid' ? 'So there is no receipt for it.' : undefined}
        >
          <button type="button" className="btn btn-primary" onClick={toDues}>Back to Dues</button>
        </Empty>
      </main>
    );
  }
  if (check.state === 'error') {
    return (
      <main className="screen">
        <TopBar title="Receipt" back={backTo} />
        <ErrorState message={check.message} onRetry={() => setReload((n) => n + 1)} />
      </main>
    );
  }
  if (!due) {
    return (
      <main className="screen">
        <TopBar title="Receipt" back={backTo} />
        <Loading />
      </main>
    );
  }

  return (
    <main className="screen receipt-screen">
      <TopBar title={location.state?.justPaid ? 'Paid' : 'Receipt'} back={backTo} />
      <p className="receipt-head">
        <strong>{inr(due.amount)}</strong> received from {due.studentName} for {monthLabel(due.month, true)}
      </p>
      <div className={`receipt-frame ${confirmed ? '' : 'is-checking'}`}>
        <canvas ref={canvasRef} className="receipt-canvas" aria-label="Receipt image" />
      </div>
      {!confirmed && <p className="hint center" role="status">Checking…</p>}
      {note && <p className="hint center">{note}</p>}

      <div className="bottom-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={share} disabled={!confirmed}>
          Share receipt
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={goBack}>
          Done
        </button>
        <button type="button" className="link undo" onClick={undo} disabled={!confirmed || busy}>
          {busy ? 'Undoing…' : 'Undo — not paid'}
        </button>
      </div>
    </main>
  );
}
