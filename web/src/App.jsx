import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state.jsx';
import TabBar from './components/TabBar.jsx';
import Login from './screens/Login.jsx';
import Dues from './screens/Dues.jsx';
import Uncollected from './screens/Uncollected.jsx';
import Receipt from './screens/Receipt.jsx';
import Students from './screens/Students.jsx';
import StudentForm from './screens/StudentForm.jsx';
import Settings from './screens/Settings.jsx';
import Admin from './screens/Admin.jsx';

export default function App() {
  const { token, tutor } = useAuth();
  const location = useLocation();

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isAdmin = tutor?.role === 'admin';
  // Full-screen flows hide the tab bar so the one primary action stands alone.
  const hideTabs = /^\/(receipt|students\/)/.test(location.pathname);

  return (
    <div className={`app ${hideTabs ? '' : 'with-tabs'}`}>
      <Routes>
        <Route path="/" element={<Dues />} />
        <Route path="/uncollected" element={<Uncollected />} />
        <Route path="/receipt/:id" element={<Receipt />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/new" element={<StudentForm />} />
        <Route path="/students/:id" element={<StudentForm />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideTabs && <TabBar isAdmin={isAdmin} />}
    </div>
  );
}
