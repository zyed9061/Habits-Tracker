import { LANGS, useI18n } from '../i18n/index.js';

// Sélecteur de langue (haut à droite) : English / French, choix mémorisé.
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="lang-switcher">
      <span className="visually-hidden">{t('lang.label')}</span>
      <select aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value)}>
        {LANGS.map((code) => (
          <option key={code} value={code}>
            {t(`lang.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
