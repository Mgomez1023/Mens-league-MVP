import { useTranslation } from "react-i18next";
import { FacebookPageEmbed } from "../components/FacebookPageEmbed";
import { PageHeader } from "../components/ui";
import { facebookPageUrl } from "../utils/site";

export default function PostsPage() {
  const { t } = useTranslation();

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("posts.eyebrow")}
        title={t("posts.title")}
        description={t("posts.description")}
      />

      <FacebookPageEmbed
        pageUrl={facebookPageUrl}
        height={820}
        variant="full"
        title={t("posts.facebookPageTitle")}
      />
    </section>
  );
}
