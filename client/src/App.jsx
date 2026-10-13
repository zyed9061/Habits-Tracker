import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import HabitsPage from './pages/HabitsPage.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import { useI18n } from './i18n/index.js';

// Chargé à la demande : Recharts ne pèse pas sur la page habitudes.
const DashboardPage = lazy(() => import('./dashboard/DashboardPage.jsx'));

export default function App() {
  const { t } = useI18n();
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-brand">{t('app.brand')}</span>
          <nav className="app-nav" aria-label={t('app.nav.label')}>
            <NavLink to="/" end>
              {t('app.nav.habits')}
            </NavLink>
            <NavLink to="/dashboard">{t('app.nav.dashboard')}</NavLink>
          </nav>
          <div className="app-header__controls">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HabitsPage />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<p className="state" role="status">{t('app.dashboardLoading')}</p>}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <div className="state">
                <p>{t('app.notFound')}</p>
                <Link to="/">{t('app.backHome')}</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
