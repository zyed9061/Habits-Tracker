import { useI18n } from '../i18n/I18nContext.jsx';
import { LANGUAGES } from '../i18n/messages.js';

export default function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="theme-toggle">
      <span className="visually-hidden">{t.language.label}</span>
      <select aria-label={t.language.label} value={lang} onChange={(e) => setLang(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.short} · {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
