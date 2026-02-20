import { Fragment, useEffect, useState } from "react";
import {
  ApiError,
  AuthError,
  PermissionError,
  createPost,
  getPosts,
  resolveApiUrl,
} from "../api";
import type { Post } from "../api";

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PostsPage({ isAdmin, onAuthError }: PostsPageProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const remainingChars = 5000 - content.length;

  const loadPosts = async () => {
    setError(null);
    try {
      const data = await getPosts();
      setPosts(data);
    } catch {
      setError("Unable to load posts right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  const handlePublish = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setFormError("Post content is required.");
      return;
    }

    setPublishing(true);
    try {
      await createPost(trimmed, imageFile);
      setContent("");
      setImageFile(null);
      setFileInputKey((prev) => prev + 1);
      setSuccess("Post published.");
      await loadPosts();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setFormError("Admin access required.");
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setFormError(err.detail);
        return;
      }
      setFormError("Unable to publish post right now.");
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
      setFormError("Please choose a valid image file.");
      return;
    }
    setFormError(null);
    setImageFile(file);
  };

  return (
    <section className="posts-page">
      <div className="page-header">
        <div>
          <h1>Posts</h1>
          <p className="muted">
            {isAdmin
              ? "Share league announcements with everyone."
              : "League announcements and updates."}
          </p>
        </div>
        <div className="posts-header-meta">
          <span className="posts-count">{posts.length} total</span>
        </div>
      </div>

      {isAdmin && (
        <div className="table-card form-card posts-composer">
          <div className="posts-composer-header">
            <h2>Publish Update</h2>
            <span className="posts-chip">Admins only</span>
          </div>
          <form className="form-grid form-stacked" onSubmit={handlePublish}>
            <label className="field">
              <span>New Post</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write an update for the league..."
                rows={5}
                maxLength={5000}
              />
            </label>
            <label className="field">
              <span>Image (optional)</span>
              <label className="upload-button post-upload-button">
                {imageFile ? imageFile.name : "Choose image"}
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleImageSelect(event.target.files?.[0])}
                />
              </label>
            </label>
            <div className="form-actions posts-composer-actions">
              <span className={`composer-counter ${remainingChars < 200 ? "low" : ""}`}>
                {remainingChars} characters left
              </span>
              <div className="posts-actions-right">
                {imageFile && (
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setFileInputKey((prev) => prev + 1);
                    }}
                  >
                    Remove image
                  </button>
                )}
                <button className="primary-button" type="submit" disabled={publishing}>
                  {publishing ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>
          </form>
          {formError && <p className="status error">{formError}</p>}
          {success && <p className="status">{success}</p>}
        </div>
      )}

      {loading && <p className="status">Loading posts...</p>}
      {!loading && error && <p className="status error">{error}</p>}

      {!loading && !error && posts.length === 0 && (
        <div className="post-empty">
          <p>No posts yet.</p>
          <p className="muted">New announcements will appear here.</p>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="posts-list">
          {posts.map((post) => (
            <article className="post-card" key={post.id}>
              <div className="post-meta">
                <div className="post-author-block">
                  <div className="post-avatar">{getAuthorInitial(post.author_name)}</div>
                  <div className="post-byline">
                    <span className="post-author">{post.author_name}</span>
                    <time className="post-time" dateTime={post.created_at}>
                      {formatDateTime(post.created_at)}
                    </time>
                  </div>
                </div>
                <span className="posts-chip">Update</span>
              </div>
              <div className="post-content">{renderContentWithLinks(post.content)}</div>
              {post.image_url && (
                <img
                  className="post-image"
                  src={resolveApiUrl(post.image_url)}
                  alt="Post"
                  loading="lazy"
                />
              )}
              {extractYoutubePreviews(post.content).map((preview) => (
                <a
                  className="post-youtube-preview"
                  href={preview.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  key={preview.id}
                >
                  <img src={preview.thumbnailUrl} alt="YouTube video thumbnail" loading="lazy" />
                  <span>Watch on YouTube</span>
                </a>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
