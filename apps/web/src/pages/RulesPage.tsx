import { useTranslation } from "react-i18next";
import { PageHeader, SectionHeader, SurfaceCard } from "../components/ui";
import { getLeagueRulesContent } from "../data/leagueRules";

function formatLastUpdated(value: string, language: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);

  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function RuleSectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <div className="rules-section-heading">
      <span className="rules-section-number">{number}</span>
      <h2>{title}</h2>
    </div>
  );
}

export default function RulesPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const content = getLeagueRulesContent(language);
  const formattedLastUpdated = formatLastUpdated(content.lastUpdated, language);
  const tocItems = [
    { id: "featured-rule", title: content.featuredRule.title },
    ...content.sections.map((section) => ({ id: section.id, title: section.title })),
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("rules.eyebrow")}
        title={t("rules.title")}
        description={t("")}
        titleAction={
          <div className="rules-updated-pill rules-updated-pill-title">
            <span>{t("rules.lastUpdatedLabel")}</span>
            <strong>{formattedLastUpdated}</strong>
          </div>
        }
      />

      {tocItems.length > 1 && (
        <SurfaceCard className="rules-toc-card">
          <SectionHeader
            title={t("rules.contentsTitle")}
            description={t("rules.contentsDescription")}
          />
          <nav aria-label={t("rules.contentsTitle")}>
            <div className="rules-toc-list">
              {tocItems.map((item, index) => (
                <a className="rules-toc-link" href={`#${item.id}`} key={item.id}>
                  <span className="rules-toc-index">{index + 1}</span>
                  <span>{item.title}</span>
                </a>
              ))}
            </div>
          </nav>
        </SurfaceCard>
      )}

      <SurfaceCard className="rules-section-card rules-featured-card">
        <article className="rules-section-anchor" id="featured-rule">
          <p className="rules-featured-kicker">{t("")}</p>
          <RuleSectionTitle number={1} title={content.featuredRule.title} />
          <div className="rules-body">
            {content.featuredRule.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {content.featuredRule.bullets && content.featuredRule.bullets.length > 0 && (
              <ul className="rules-list">
                {content.featuredRule.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </SurfaceCard>

      <div className="rules-sections">
        {content.sections.map((section, index) => (
          <SurfaceCard className="rules-section-card" key={section.id}>
            <article className="rules-section-anchor" id={section.id}>
              <RuleSectionTitle number={index + 2} title={section.title} />
              <div className="rules-body">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="rules-list">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </SurfaceCard>
        ))}
      </div>
    </section>
  );
}
