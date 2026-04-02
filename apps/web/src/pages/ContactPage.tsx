import { PageHeader, SectionHeader, SurfaceCard } from "../components/ui";
import { useTranslation } from "react-i18next";
import { leagueProfile } from "../utils/site";

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <section className="page-stack contact-page">
      <PageHeader
        eyebrow={t("contact.eyebrow")}
        title={t("contact.title")}
        description={t("contact.cardDescription")}
      />

      <div className="contact-layout">

        <SurfaceCard className="contact-methods-card">
          <SectionHeader
            title={t("contact.methodsTitle")}
            description={t("contact.methodsDescription")}
          />

          <div className="contact-methods-grid">
            <article className="contact-method-card">
              <p className="contact-method-label">{t("contact.emailLabel")}</p>
              <a className="contact-method-link" href={`mailto:${leagueProfile.email}`}>
                {leagueProfile.email}
              </a>
            </article>

            <article className="contact-method-card">
              <p className="contact-method-label">{t("contact.phoneLabel")}</p>
              <a className="contact-method-link" href={leagueProfile.phoneHref}>
                {leagueProfile.phone}
              </a>
            </article>
          </div>
        </SurfaceCard>
      </div>
    </section>
  );
}
