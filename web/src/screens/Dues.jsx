import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { currentMonth, inr, isMonth, monthLabel, shiftMonth } from '../format.js';
import { useAuth } from '../state.jsx';
import { DueRow, useDueActions } from '../components/dues.jsx';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'overdue', label: 'Overdue', test: (d) => d.status === 'due' && d.overdue },
  { key: 'due', label: 'Due', test: (d) => d.status === 'due' && !d.overdue },
  { key: 'paid', label: 'Paid', test: (d) => d.status === 'paid' },
];

export default function Dues() {
  const { tutor } = useAuth();
  const [params, setParams] = useSearchParams();
  const thisMonth = currentMonth();
  const qMonth = params.get('month');
  const month = isMonth(qMonth) && qMonth <= thisMonth ? qMonth : thisMonth;

  const [unc, setUnc] = useState(null); // { total, count }
  const [data, setData] = useState(null); // { summary }
  const [dues, setDues] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [reload, setReload] = useState(0);
  const loadSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    loadSeq.current += 1;
    setData(null);
    setError('');
    Promise.all([api.dues(month), api.uncollected()])
      .then(([d, u]) => {
        if (!alive) return;
        setData(d);
        setDues(d?.dues || []);
        setUnc(u);
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [month, reload]);

  // After a waive / undo-waive the row is already updated from the server's
  // reply; quietly refresh the server-computed hero total and month summary.
  const refreshTotals = useCallback(() => {
    const seq = loadSeq.current;
    Promise.all([api.dues(month), api.uncollected()])
      .then(([d, u]) => {
        if (seq !== loadSeq.current) return; // month changed meanwhile
        setData(d);
        setUnc(u);
      })
      .catch(() => { /* best effort; the next load corrects it */ });
  }, [month]);

  const { remind, startPay, unwaive, remindingId, undoingId, sheet } = useDueActions(setDues, refreshTotals);

  const goMonth = useCallback((delta) => {
    const next = shiftMonth(month, delta);
    setParams(next === thisMonth ? {} : { month: next }, { replace: true });
  }, [month, thisMonth, setParams]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.key] = dues.filter(f.test).length;
    return c;
  }, [dues]);
  const shown = useMemo(() => dues.filter(FILTERS.find((f) => f.key === filter).test), [dues, filter]);

  const s = data?.summary;

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="brand">Guru<span>Khata</span></h1>
      </header>

      {tutor && !tutor.upiId && (
        <Link to="/settings" className="banner">
          Add your UPI ID so parents can pay you straight from the reminder.
          <span className="banner-cta">Add</span>
        </Link>
      )}

      <Link to="/uncollected" className="hero card" aria-label="See all uncollected fees">
        <div className="hero-label">Uncollected</div>
        <div className="hero-amount">{unc ? inr(unc.total) : '—'}</div>
        <div className="hero-sub">
          {!unc ? ' ' : unc.count === 0 ? 'All fees collected' : `${unc.count} ${unc.count === 1 ? 'fee' : 'fees'} pending, all months`}
          <span className="hero-chev" aria-hidden="true">›</span>
        </div>
      </Link>

      <div className="month-switch">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => goMonth(-1)}>‹</button>
        <div className="month-name">{monthLabel(month, true)}</div>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => goMonth(1)}
          disabled={month >= thisMonth}>›</button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="summary">
            <div className="summary-cell">
              <div className="summary-label">Collected</div>
              <div className="summary-value good">{inr(s?.collected)}</div>
              <div className="summary-sub">{s?.paidCount ?? 0} paid</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Pending</div>
              <div className="summary-value warn">{inr(s?.pending)}</div>
              <div className="summary-sub">
                {s?.dueCount ?? 0} due{s?.overdueCount ? ` · ${s.overdueCount} late` : ''}
              </div>
            </div>
          </div>

          <div className="chips" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
                className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label} <span className="chip-count">{counts[f.key]}</span>
              </button>
            ))}
          </div>

          {dues.length === 0 ? (
            <Empty
              title={`No fees for ${monthLabel(month)}`}
              text={month === thisMonth ? 'Add students and their monthly fee will show here.' : 'Nothing was billed this month.'}
            >
              {month === thisMonth && <Link to="/students/new" className="btn btn-primary">Add student</Link>}
            </Empty>
          ) : shown.length === 0 ? (
            <Empty title={filter === 'paid' ? 'No payments yet' : 'Nothing here'} />
          ) : (
            <ul className="list">
              {shown.map((d) => (
                <DueRow key={d.id} due={d} onRemind={remind} onPay={startPay} onUnwaive={unwaive}
                  reminding={remindingId === d.id} undoing={undoingId === d.id} />
              ))}
            </ul>
          )}
        </>
      )}
      {sheet}
    </main>
  );
}
