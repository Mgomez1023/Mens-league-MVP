import { useTranslation } from "react-i18next";
import { PageHeader, SurfaceCard } from "../components/ui";

const RULES_DOCUMENT_PATH = "/league-bylaws.pdf";

export default function RulesPage() {
  const { t } = useTranslation();

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("rules.eyebrow")}
        title={t("rules.title")}
        description={t("rules.description")}
      />

      <SurfaceCard className="rules-document-card" padded={false}>
        <object
          aria-label={t("rules.documentLabel")}
          className="rules-document-frame"
          data={RULES_DOCUMENT_PATH}
          type="application/pdf"
        >
          <div className="rules-document-fallback">
            <p>{t("rules.fallbackMessage")}</p>
            <a
              className="button button-secondary"
              href={RULES_DOCUMENT_PATH}
              rel="noreferrer"
              target="_blank"
            >
              {t("rules.openDocument")}
            </a>
          </div>
        </object>
      </SurfaceCard>
    </section>
  );
}
