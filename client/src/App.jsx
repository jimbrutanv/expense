import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Layout from './components/Layout.jsx';
import Projects from './pages/Projects.jsx';
import ProjectLayout from './pages/ProjectLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Expenses from './pages/Expenses.jsx';
import Income from './pages/Income.jsx';
import Tasks from './pages/Tasks.jsx';
import Files from './pages/Files.jsx';
import Stakeholders from './pages/Stakeholders.jsx';
import Settlement from './pages/Settlement.jsx';
import Reports from './pages/Reports.jsx';
import Overview from './pages/Overview.jsx';
import Members from './pages/Members.jsx';
import ProjectSettings from './pages/ProjectSettings.jsx';
import Users from './pages/Users.jsx';
import Backups from './pages/Backups.jsx';
import Audit from './pages/Audit.jsx';
import Account from './pages/Account.jsx';
import Docs from './pages/Docs.jsx';

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Loading label="Starting BuildLedger…" />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  // Force a password change for freshly-created / reset accounts.
  if (user.must_change_password) {
    return <Routes><Route path="*" element={<ChangePassword forced />} /></Routes>;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="income" element={<Income />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="files" element={<Files />} />
          <Route path="stakeholders" element={<Stakeholders />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="members" element={<Members />} />
          <Route path="settings" element={<ProjectSettings />} />
        </Route>
        <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
        <Route path="backups" element={<RequireAdmin><Backups /></RequireAdmin>} />
        <Route path="audit" element={<RequireAdmin><Audit /></RequireAdmin>} />
        <Route path="docs" element={<RequireAdmin><Docs /></RequireAdmin>} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
