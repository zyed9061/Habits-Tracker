import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import HabitsPage from './pages/HabitsPage.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

// Chargé à la demande : Recharts ne pèse pas sur la page habitudes.
const DashboardPage = lazy(() => import('./dashboard/DashboardPage.jsx'));

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-brand">Habitudes</span>
          <nav className="app-nav" aria-label="Navigation principale">
            <NavLink to="/" end>
              Habitudes
            </NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HabitsPage />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<p className="state" role="status">Chargement du dashboard…</p>}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <div className="state">
                <p>Page introuvable.</p>
                <Link to="/">Retour aux habitudes</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
