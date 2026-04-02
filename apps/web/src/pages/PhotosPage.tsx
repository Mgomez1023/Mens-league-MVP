import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  AuthError,
  deletePhoto,
  fetchPhotos,
  PermissionError,
  resolveApiUrl,
  uploadPhoto,
} from "../api";
import type { Photo } from "../api";
import { EmptyState, LoadingState, Notice, PageHeader, SectionHeader, SurfaceCard } from "../components/ui";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type PhotosPageProps = {
  isAdmin: boolean;
  onAuthError: () => void;
};

type UploadRow = {
  id: number;
  file: File | null;
  caption: string;
};

const MAX_UPLOAD_ROWS = 5;

const createEmptyUploadRow = (id: number): UploadRow => ({
  id,
  file: null,
  caption: "",
});

export default function PhotosPage({ isAdmin, onAuthError }: PhotosPageProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([createEmptyUploadRow(1)]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useBodyScrollLock(lightboxIndex !== null || uploadModalOpen);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchPhotos();
        if (!active) return;
        setPhotos(data);
      } catch {
        if (!active) return;
        setError(t("photos.loadError"));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }
      if (photos.length < 2) return;
      if (event.key === "ArrowRight") {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % photos.length));
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((prev) => (prev === null ? null : (prev - 1 + photos.length) % photos.length));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, photos.length]);

  const selectedPhoto = useMemo(
    () => (lightboxIndex === null ? null : photos[lightboxIndex] ?? null),
    [lightboxIndex, photos],
  );

  const closeUploadModal = (force = false) => {
    if (uploading && !force) return;
    setUploadModalOpen(false);
    setUploadError(null);
    setUploadRows([createEmptyUploadRow(1)]);
  };

  const handleUploadFileChange = (rowId: number, file?: File | null) => {
    if (file && !file.type.startsWith("image/")) {
      setUploadError(t("photos.invalidImage"));
      return;
    }

    setUploadError(null);
    setUploadRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, file: file ?? null } : row)),
    );
  };

  const handleUploadCaptionChange = (rowId: number, value: string) => {
    setUploadRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, caption: value } : row)),
    );
  };

  const handleAddUploadRow = () => {
    setUploadRows((prev) => {
      if (prev.length >= MAX_UPLOAD_ROWS) return prev;
      const nextId = prev.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
      return [...prev, createEmptyUploadRow(nextId)];
    });
  };

  const handleRemoveUploadRow = (rowId: number) => {
    setUploadRows((prev) => {
      if (prev.length === 1) {
        return [createEmptyUploadRow(prev[0]?.id ?? 1)];
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const handleUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const rowsToUpload = uploadRows.filter((row) => row.file);
    if (rowsToUpload.length === 0) {
      setUploadError(t("photos.emptyBatchError"));
      return;
    }

    setUploading(true);
    setUploadError(null);
    setNotice(null);

    try {
      const createdPhotos: Photo[] = [];
      for (const row of rowsToUpload) {
        if (!row.file) continue;
        const created = await uploadPhoto(row.file, row.caption);
        createdPhotos.push(created);
      }
      setPhotos((prev) => [...createdPhotos.slice().reverse(), ...prev]);
      closeUploadModal(true);
      setNotice(t("photos.uploadSuccess", { count: createdPhotos.length }));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setUploadError(err.detail ?? t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setUploadError(err.detail);
        return;
      }
      setUploadError(t("photos.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSelectedPhoto = async () => {
    if (!selectedPhoto || !isAdmin) return;
    if (!window.confirm(t("photos.deleteConfirm"))) return;

    setDeletingId(selectedPhoto.id);
    setNotice(null);
    setError(null);
    try {
      await deletePhoto(selectedPhoto.id);
      setPhotos((prev) => prev.filter((photo) => photo.id !== selectedPhoto.id));
      setLightboxIndex(null);
      setNotice(t("photos.deleteSuccess"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setError(t("photos.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const showPrev = () => {
    if (photos.length < 2) return;
    setLightboxIndex((prev) => (prev === null ? null : (prev - 1 + photos.length) % photos.length));
  };

  const showNext = () => {
    if (photos.length < 2) return;
    setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % photos.length));
  };

  return (
    <section className="page-stack photos-page">
      <PageHeader
        eyebrow={t("photos.eyebrow")}
        title={t("photos.title")}
        description={t("photos.description")}
        titleAction={
          isAdmin ? (
            <button
              className="button button-primary button-small page-title-action-compact"
              type="button"
              onClick={() => setUploadModalOpen(true)}
            >
              {t("photos.uploadAction")}
            </button>
          ) : undefined
        }
      />

      {loading ? <LoadingState label={t("photos.loading")} /> : null}
      {!loading && error ? <Notice variant="error">{error}</Notice> : null}
      {!loading && notice ? <Notice variant="success">{notice}</Notice> : null}

      {!loading && !error ? (
        photos.length === 0 ? (
          <SurfaceCard className="photos-empty-card">
            <EmptyState
              title={t("photos.emptyTitle")}
              description={t("photos.emptyDescription")}
            />
          </SurfaceCard>
        ) : (
          <div className="photos-grid" aria-label={t("photos.gridLabel")}>
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                className="photo-card"
                type="button"
                onClick={() => setLightboxIndex(index)}
              >
                <div className="photo-card-image-wrap">
                  <img
                    className="photo-card-image"
                    src={resolveApiUrl(photo.image_url)}
                    alt={photo.alt}
                    loading="lazy"
                  />
                </div>
                {photo.caption ? (
                  <div className="photo-card-caption">
                    <p>{photo.caption}</p>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )
      ) : null}

      {uploadModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeUploadModal();
            }
          }}
        >
          <SurfaceCard className="modal-card photos-upload-modal">
            <SectionHeader
              title={t("photos.uploadTitle")}
              description={t("photos.uploadDescription")}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => closeUploadModal()}
                  disabled={uploading}
                >
                  {t("buttons.close")}
                </button>
              }
            />

            <form className="form-grid form-grid-stacked" onSubmit={handleUploadSubmit}>
              <div className="photos-upload-rows">
                {uploadRows.map((row, index) => (
                  <div className="photos-upload-row" key={row.id}>
                    <label className="field photos-upload-file-field">
                      <span>{t("photos.fileRowLabel", { count: index + 1 })}</span>
                      <label className="file-trigger photos-upload-trigger">
                        <span>{row.file ? row.file.name : t("photos.chooseFile")}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            handleUploadFileChange(row.id, event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                    </label>

                    <label className="field photos-upload-caption-field">
                      <span>{t("photos.captionLabel")}</span>
                      <input
                        value={row.caption}
                        onChange={(event) => handleUploadCaptionChange(row.id, event.target.value)}
                        placeholder={t("photos.captionPlaceholder")}
                      />
                    </label>

                    {uploadRows.length > 1 ? (
                      <button
                        className="button button-secondary button-small photos-upload-remove"
                        type="button"
                        onClick={() => handleRemoveUploadRow(row.id)}
                        disabled={uploading}
                      >
                        {t("photos.removeRow")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="photos-upload-row-actions">
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={handleAddUploadRow}
                  disabled={uploading || uploadRows.length >= MAX_UPLOAD_ROWS}
                >
                  {t("photos.addImage")}
                </button>
                {uploadRows.length >= MAX_UPLOAD_ROWS ? (
                  <span className="photos-upload-limit-note">{t("photos.maxRowsReached")}</span>
                ) : null}
              </div>

              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={uploading}>
                  {uploading ? t("common.saveInProgress") : t("photos.uploadSubmitBatch")}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => closeUploadModal()}
                  disabled={uploading}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>

            {uploadError ? <Notice variant="error">{uploadError}</Notice> : null}
          </SurfaceCard>
        </div>
      ) : null}

      {selectedPhoto ? (
        <div
          className="gallery-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setLightboxIndex(null);
            }
          }}
        >
          <div className="gallery-lightbox">
            <div className="gallery-lightbox-topbar">
              <div className="gallery-lightbox-meta">
                {selectedPhoto.caption ? <p>{selectedPhoto.caption}</p> : null}
              </div>
              <div className="gallery-lightbox-actions">
                {isAdmin ? (
                  <button
                    className="button button-danger button-small"
                    type="button"
                    onClick={() => void handleDeleteSelectedPhoto()}
                    disabled={deletingId === selectedPhoto.id}
                  >
                    {deletingId === selectedPhoto.id ? t("common.deleteInProgress") : t("buttons.delete")}
                  </button>
                ) : null}
                <button
                  className="game-details-close"
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  aria-label={t("buttons.close")}
                >
                  <span aria-hidden="true">x</span>
                </button>
              </div>
            </div>

            <div className="gallery-lightbox-stage">
              {photos.length > 1 ? (
                <button
                  className="gallery-lightbox-nav gallery-lightbox-nav-prev"
                  type="button"
                  onClick={showPrev}
                  aria-label={t("photos.previous")}
                >
                  <span aria-hidden="true">‹</span>
                </button>
              ) : null}

              <img
                className="gallery-lightbox-image"
                src={resolveApiUrl(selectedPhoto.image_url)}
                alt={selectedPhoto.alt}
              />

              {photos.length > 1 ? (
                <button
                  className="gallery-lightbox-nav gallery-lightbox-nav-next"
                  type="button"
                  onClick={showNext}
                  aria-label={t("photos.next")}
                >
                  <span aria-hidden="true">›</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
