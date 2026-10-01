import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { inr } from '../format.js';
import { DueRow, useDueActions } from '../components/dues.jsx';
import { Empty, ErrorState, Loading, TopBar } from '../components/ui.jsx';

export default function Uncollected() {
  const [dues, setDues] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    api.uncollected()
      .then((r) => alive && setDues(r?.dues || []))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [reload]);

  const { remind, startPay, unwaive, remindingId, undoingId, sheet } =
    useDueActions((fn) => setDues((l) => fn(l || [])));

  // Recomputed locally so the total drops the moment a fee is marked paid or
  // waived ("Not charging"), and comes back if a waive is undone.
  const open = useMemo(() => (dues || []).filter((d) => d.status === 'due'), [dues]);
  const total = open.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  return (
    <main className="screen">
      <TopBar title="Uncollected" back="/" />
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !dues ? (
        <Loading />
      ) : open.length === 0 ? (
        <Empty title="All fees collected" text="Nothing pending from any month." />
      ) : (
        <>
          <div className="total-line">
            <span>{open.length} pending · oldest first</span>
            <strong>{inr(total)}</strong>
          </div>
          <ul className="list">
            {dues.map((d) => (
              <DueRow key={d.id} due={d} showMonth onRemind={remind} onPay={startPay} onUnwaive={unwaive}
                reminding={remindingId === d.id} undoing={undoingId === d.id} />
            ))}
          </ul>
        </>
      )}
      {sheet}
    </main>
  );
}
