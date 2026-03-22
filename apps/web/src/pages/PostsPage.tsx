import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  AuthError,
  PermissionError,
  createPost,
  deletePost,
  getPosts,
  resolveApiUrl,
} from "../api";
import type { Post } from "../api";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  SectionHeader,
  SurfaceCard,
} from "../components/ui";
import { formatDateTime } from "../utils/league";

type PostsPageProps = {
  isAdmin: boolean;
  onAuthError: () => void;
};

function getAuthorInitial(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "?";
  return trimmed[0]?.toUpperCase() ?? "?";
}

function normalizeUrlToken(token: string) {
  const match = token.match(/^(https?:\/\/\S*?)([),.!?;:]*)$/);
  if (!match) return { url: token, suffix: "" };
  return { url: match[1], suffix: match[2] };
}

function parseYouTubeVideoId(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host.endsWith("youtube.com")) {
      id = url.searchParams.get("v") ?? "";
      if (!id) {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
          id = segments[1] ?? "";
        }
      }
    }

    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function extractYoutubePreviews(content: string) {
  const regex = /(https?:\/\/[^\s]+)/g;
  const seen = new Set<string>();
  const previews: Array<{ id: string; watchUrl: string; thumbnailUrl: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const { url } = normalizeUrlToken(match[0]);
    const id = parseYouTubeVideoId(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    previews.push({
      id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return previews;
}

function renderContentWithLinks(content: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(urlRegex);
    return (
      <Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (!/^https?:\/\/\S+$/.test(part)) {
            return <span key={`text-${lineIndex}-${partIndex}`}>{part}</span>;
          }
          const { url, suffix } = normalizeUrlToken(part);
          return (
            <Fragment key={`link-${lineIndex}-${partIndex}`}>
              <a className="post-link" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
              {suffix && <span>{suffix}</span>}
            </Fragment>
          );
        })}
        {lineIndex < lines.length - 1 && <br />}
      </Fragment>
    );
  });
}

export default function PostsPage({ isAdmin, onAuthError }: PostsPageProps) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const remainingChars = 5000 - content.length;

  const loadPosts = async () => {
    setError(null);
    try {
      const data = await getPosts();
      setPosts(data);
    } catch {
      setError(t("posts.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, [t]);

  const handlePublish = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setFormError(t("posts.contentRequired"));
      return;
    }

    setPublishing(true);
    try {
      await createPost(trimmed, imageFile);
      setContent("");
      setImageFile(null);
      setFileInputKey((prev) => prev + 1);
      setComposerOpen(false);
      setSuccess(t("posts.publishSuccess"));
      await loadPosts();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setFormError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setFormError(err.detail);
        return;
      }
      setFormError(t("posts.publishError"));
    } finally {
      setPublishing(false);
    }
  };

  const handleImageSelect = (file?: File | null) => {
    if (!file) {
      setImageFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFormError(t("posts.invalidImage"));
      return;
    }
    setFormError(null);
    setImageFile(file);
  };

  const handleDelete = async (postId: number) => {
    if (!window.confirm(t("posts.deleteConfirm"))) return;
    setDeletingId(postId);
    setError(null);
    setSuccess(null);
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
      setSuccess(t("posts.deleteSuccess"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setError(err.detail);
        return;
      }
      setError(t("posts.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("posts.eyebrow")}
        title={t("posts.title")}
        description={t("posts.description")}
        actions={
          isAdmin ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setComposerOpen(true)}
            >
              {t("buttons.newAnnouncement")}
            </button>
          ) : undefined
        }
      />

      {loading && <LoadingState label={t("posts.loading")} />}
      {!loading && error && <Notice variant="error">{error}</Notice>}
      {!loading && success && <Notice variant="success">{success}</Notice>}

      {!loading && !error && posts.length === 0 && (
        <SurfaceCard>
          <EmptyState
            title={t("posts.emptyTitle")}
            description={t("posts.emptyDescription")}
          />
        </SurfaceCard>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="announcement-feed news-feed">
          {posts.map((post) => (
            <SurfaceCard className="post-card" key={post.id}>
              <div className="post-card-header">
                <div className="post-author-block">
                  <div className="post-avatar">{getAuthorInitial(post.author_name)}</div>
                  <div>
                    <p className="post-author-name">{post.author_name}</p>
                    <time className="post-timestamp" dateTime={post.created_at}>
                      {formatDateTime(post.created_at)}
                    </time>
                  </div>
                </div>
                <div className="post-card-tools">
                  <span className="news-chip">{t("posts.badge")}</span>
                  {isAdmin && (
                    <button
                      className="button button-danger button-small"
                      type="button"
                      onClick={() => {
                        void handleDelete(post.id);
                      }}
                      disabled={deletingId === post.id}
                    >
                      {deletingId === post.id ? t("common.deleteInProgress") : t("buttons.delete")}
                    </button>
                  )}
                </div>
              </div>

              <div className="post-card-body">
                <div className="post-content">{renderContentWithLinks(post.content)}</div>

                {post.image_url && (
                  <img
                    className="post-image"
                    src={resolveApiUrl(post.image_url)}
                    alt={t("common.announcementImageAlt")}
                    loading="lazy"
                  />
                )}

                {extractYoutubePreviews(post.content).map((preview) => (
                  <a
                    className="post-video-link"
                    href={preview.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    key={preview.id}
                  >
                    <img src={preview.thumbnailUrl} alt={t("common.youtubeThumbnailAlt")} loading="lazy" />
                    <span>{t("posts.watchVideo")}</span>
                  </a>
                ))}
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      {isAdmin && composerOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("posts.composerTitle")}
              description={t("posts.composerDescription")}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setFormError(null);
                  }}
                >
                  {t("buttons.close")}
                </button>
              }
            />
            <form className="form-grid form-grid-stacked" onSubmit={handlePublish}>
              <label className="field">
                <span>{t("posts.announcementLabel")}</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={t("posts.placeholder")}
                  rows={6}
                  maxLength={5000}
                />
              </label>

              <label className="field">
                <span>{t("common.image")}</span>
                <label className="file-trigger">
                  <span>{imageFile ? imageFile.name : t("common.chooseImage")}</span>
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleImageSelect(event.target.files?.[0])}
                  />
                </label>
              </label>

              <div className="form-actions composer-actions">
                <span className={`character-counter ${remainingChars < 200 ? "low" : ""}`}>
                  {t("posts.charactersRemaining", { count: remainingChars })}
                </span>
                <div className="inline-actions">
                  {imageFile && (
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setImageFile(null)}
                    >
                      {t("posts.removeImage")}
                    </button>
                  )}
                  <button className="button button-primary" type="submit" disabled={publishing}>
                    {publishing ? t("common.saveInProgress") : t("buttons.publishAnnouncement")}
                  </button>
                </div>
              </div>
            </form>
            {formError && <Notice variant="error">{formError}</Notice>}
          </SurfaceCard>
        </div>
      )}
    </section>
  );
}
