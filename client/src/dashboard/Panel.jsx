import { describeError, useI18n } from '../i18n/I18nContext.jsx';

// Cadre commun d'un bloc du dashboard : titre + gestion des états chargement / erreur / vide.
export default function Panel({ title, subtitle, state, isEmpty, emptyText, skeleton, className = '', children }) {
  const { t } = useI18n();
  const { loading, error, data, reload } = state;
  let body;
  if (loading && !data) {
    body = skeleton ?? <div className="dv-skeleton dv-skeleton--chart" aria-hidden="true" />;
  } else if (error) {
    body = (
      <div className="dv-state dv-state--error" role="alert">
        <p>{t.dashboard.loadError}</p>
        <p className="dv-state__detail">{describeError(error, t)}</p>
        <button type="button" className="dv-btn" onClick={reload}>
          {t.dashboard.retry}
        </button>
      </div>
    );
  } else if (isEmpty?.(data)) {
    body = (
      <div className="dv-state dv-state--empty">
        <p>{emptyText ?? t.dashboard.emptyDefault}</p>
      </div>
    );
  } else {
    body = children(data);
  }

  return (
    <section className={`dv-panel ${className}`} aria-busy={loading}>
      {title && (
        <header className="dv-panel__head">
          <h2 className="dv-panel__title">{title}</h2>
          {subtitle && <p className="dv-panel__subtitle">{subtitle}</p>}
        </header>
      )}
      {body}
    </section>
  );
}
