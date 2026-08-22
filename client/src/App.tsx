import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/hooks';
import { Layout } from './components/Layout';
import AdminAudit from './pages/admin/AdminAudit';
import AdminFixtures from './pages/admin/AdminFixtures';
import AdminHome from './pages/admin/AdminHome';
import AdminLayout from './pages/admin/AdminLayout';
import AdminTeams from './pages/admin/AdminTeams';
import AdminUsers from './pages/admin/AdminUsers';
import History from './pages/History';
import HistoryRound from './pages/HistoryRound';
import Home from './pages/Home';
import Install from './pages/Install';
import Live from './pages/Live';
import Login from './pages/Login';
import PlayerStats from './pages/PlayerStats';
import Predictions from './pages/Predictions';
import Profile from './pages/Profile';
import Register from './pages/Register';
import RoundSummary from './pages/RoundSummary';

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <div className="animate-bounce text-6xl">⚽</div>
      <div className="font-display text-xl font-bold text-grass-300">0 מושג בכדורגל</div>
    </div>
  );
}

export default function App() {
  const me = useMe();

  if (me.isLoading) return <Splash />;
  const user = me.data?.user ?? null;

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/install" element={<Install />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout me={user} />}>
        <Route path="/" element={<Home />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/rounds/:roundId/summary" element={<RoundSummary />} />
        <Route path="/live" element={<Live />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:roundId" element={<HistoryRound />} />
        <Route path="/players/:userId" element={<PlayerStats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/install" element={<Install />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="fixtures" element={<AdminFixtures />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="audit" element={<AdminAudit />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
