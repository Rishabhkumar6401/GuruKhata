import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { relativeDays, shortDate } from '../format.js';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

const STATS = [
  ['tutors', 'Tutors'],
  ['activeTutors7d', 'Active, last 7 days'],
  ['students', 'Students'],
  ['duesThisMonth', 'Fees this month'],
  ['paidThisMonth', 'Paid this month'],
  ['remindersThisMonth', 'Reminders this month'],
];

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [tutors, setTutors] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    Promise.all([api.adminStats(), api.adminTutors()])
      .then(([s, t]) => {
        if (!alive) return;
        setStats(s || {});
        setTutors(t?.tutors || []);
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [reload]);

  return (
    <main className="screen">
      <header className="topbar"><h1>Admin</h1></header>
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !stats ? (
        <Loading />
      ) : (
        <>
          <div className="stat-grid">
            {STATS.map(([k, label]) => (
              <div key={k} className="stat">
                <div className="stat-value">{Number(stats[k] ?? 0).toLocaleString('en-IN')}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>

          <h2 className="section-title">Tutors · newest first</h2>
          {tutors.length === 0 ? (
            <Empty title="No tutors yet" />
          ) : (
            <ul className="list">
              {tutors.map((t) => (
                <li key={t.id} className="row">
                  <div className="row-main">
                    <div className="row-text">
                      <div className="row-title">{t.name || '—'}</div>
                      <div className="row-sub">
                        Joined {shortDate(t.createdAt)} · Active {relativeDays(t.lastActiveAt).toLowerCase()}
                      </div>
                    </div>
                    <div className="row-end">
                      <div className="row-amount">{t.studentCount ?? 0} <span className="unit">{t.studentCount === 1 ? 'student' : 'students'}</span></div>
                      <span className={`pill ${t.plan === 'paid' ? 'pill-paid' : 'pill-waived'}`}>
                        {t.plan === 'paid' ? 'Paid' : 'Free'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
