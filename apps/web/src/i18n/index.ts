import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import esCommon from "./locales/es/common.json";

const resources = {
  en: {
    common: enCommon,
  },
  es: {
    common: esCommon,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ["en", "es"],
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common"],
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language.startsWith("es") ? "es" : "en";
}

syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

export function getCurrentLocale() {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return language.startsWith("es") ? "es-ES" : "en-US";
}

export default i18n;
