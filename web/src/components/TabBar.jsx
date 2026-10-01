import { NavLink, useLocation } from 'react-router-dom';

const ic = {
  dues: <path d="M7 5h10M7 9.5h10M7 5h3.5c3.5 0 5 2 5 4.5s-2 4.5-5.5 4.5H8l8 6" />,
  students: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3c1.6.6 2.7 2.2 3 4.7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  admin: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />,
};

function Tab({ to, label, icon, end, alsoActive }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab ${isActive || alsoActive ? 'active' : ''}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <span>{label}</span>
    </NavLink>
  );
}

export default function TabBar({ isAdmin }) {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      <Tab to="/" end label="Dues" icon={ic.dues} alsoActive={pathname === '/uncollected'} />
      <Tab to="/students" label="Students" icon={ic.students} />
      <Tab to="/settings" label="Settings" icon={ic.settings} />
      {isAdmin && <Tab to="/admin" label="Admin" icon={ic.admin} />}
    </nav>
  );
}
