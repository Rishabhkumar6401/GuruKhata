import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { inr, ordinal } from '../format.js';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

export default function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    setStudents(null);
    api.students(showRemoved)
      .then((r) => alive && setStudents(r?.students || []))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [showRemoved, reload]);

  const active = (students || []).filter((s) => s.active !== false);
  const removed = (students || []).filter((s) => s.active === false);
  const monthly = active.reduce((sum, s) => sum + Number(s.monthlyFee || 0), 0);

  return (
    <main className="screen">
      <header className="topbar">
        <h1>Students</h1>
        {students && students.length > 0 && (
          <div className="topbar-right">
            <Link to="/students/new" className="btn btn-primary btn-sm">Add</Link>
          </div>
        )}
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !students ? (
        <Loading />
      ) : active.length === 0 && removed.length === 0 ? (
        <Empty title="No students yet" text="Add a student with their monthly fee. Their fee will show on the Dues screen.">
          <Link to="/students/new" className="btn btn-primary">Add your first student</Link>
        </Empty>
      ) : (
        <>
          <div className="total-line">
            <span>{active.length} active</span>
            <span>{inr(monthly)} / month</span>
          </div>
          <ul className="list">
            {active.map((s) => (
              <StudentRow key={s.id} s={s} onOpen={() => navigate(`/students/${encodeURIComponent(s.id)}`)} />
            ))}
          </ul>
          {showRemoved && removed.length > 0 && (
            <>
              <h2 className="section-title">Removed</h2>
              <ul className="list">
                {removed.map((s) => (
                  <StudentRow key={s.id} s={s} onOpen={() => navigate(`/students/${encodeURIComponent(s.id)}`)} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {students && (
        <button type="button" className="link center-block" onClick={() => setShowRemoved((v) => !v)}>
          {showRemoved ? 'Hide removed students' : 'Show removed students'}
        </button>
      )}
    </main>
  );
}

function StudentRow({ s, onOpen }) {
  const inactive = s.active === false;
  return (
    <li className={`row ${inactive ? 'is-inactive' : ''}`}>
      <button type="button" className="row-main tappable" onClick={onOpen}>
        <div className="row-text">
          <div className="row-title">{s.name}</div>
          <div className="row-sub">
            {[!s.parentPhone && !inactive ? 'No number' : null, s.subject, s.dueDay ? `Due ${ordinal(s.dueDay)}` : null]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="row-end">
          <div className="row-amount">{inr(s.monthlyFee)}</div>
          {inactive && <span className="pill pill-waived">Removed</span>}
        </div>
      </button>
    </li>
  );
}
