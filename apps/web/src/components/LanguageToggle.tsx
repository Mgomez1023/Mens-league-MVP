import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", labelKey: "language.englishFull", shortKey: "language.english" },
  { code: "es", labelKey: "language.spanishFull", shortKey: "language.spanish" },
] as const;

export default function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const currentLanguage = (i18n.resolvedLanguage ?? i18n.language).startsWith("es") ? "es" : "en";

  return (
    <div className="language-toggle" role="group" aria-label={t("language.switcherLabel")}>
      {languages.map((language) => {
        const active = currentLanguage === language.code;
        return (
          <button
            key={language.code}
            className={`language-toggle-button ${active ? "active" : ""}`}
            type="button"
            onClick={() => {
              void i18n.changeLanguage(language.code);
            }}
            aria-pressed={active}
            title={t(language.labelKey)}
          >
            {t(language.shortKey)}
          </button>
        );
      })}
    </div>
  );
}
