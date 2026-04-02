import { useMemo } from "react";
import { useTranslation } from "react-i18next";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type FacebookPageEmbedProps = {
  pageUrl: string;
  height: number;
  variant?: "compact" | "full";
  title?: string;
};

export function FacebookPageEmbed({
  pageUrl,
  height,
  variant = "full",
  title,
}: FacebookPageEmbedProps) {
  const { t } = useTranslation();
  const width = variant === "compact" ? 380 : 500;
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      href: pageUrl,
      tabs: "timeline",
      width: String(width),
      height: String(height),
      small_header: variant === "compact" ? "true" : "false",
      adapt_container_width: "true",
      hide_cover: "false",
      show_facepile: "false",
    });

    return `https://www.facebook.com/plugins/page.php?${params.toString()}`;
  }, [height, pageUrl, variant, width]);

  return (
    <section className={cx("facebook-page-embed", `facebook-page-embed-${variant}`)}>
      {title ? (
        <div className="facebook-page-embed-heading">
          <h2>{title}</h2>
        </div>
      ) : null}

      <div className="facebook-page-embed-frame-shell">
        <iframe
          title={title ?? "Benito Juarez Men's Baseball League Facebook feed"}
          src={iframeSrc}
          width={width}
          height={height}
          className="facebook-page-embed-frame"
          style={{ border: "none", overflow: "hidden" }}
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className="facebook-page-embed-fallback">
        <div className="facebook-page-embed-fallback-copy">
          <p>{t("posts.facebookFallbackTitle")}</p>
          <span>{t("")}</span>
        </div>
        <a
          className="button button-secondary facebook-page-embed-link"
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("posts.facebookFallbackButton")}
        </a>
      </div>
    </section>
  );
}
