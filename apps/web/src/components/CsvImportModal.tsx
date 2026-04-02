import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Team } from "../api";
import {
  buildCsvImportPreview,
  buildCsvTemplate,
  getCsvImportConfig,
  type CsvImportMode,
  type CsvImportPreview,
  type CsvImportResult,
} from "../utils/csvImport";
import { LoadingState, Notice, SectionHeader, StatPill, SurfaceCard } from "./ui";

type CsvImportModalProps = {
  open: boolean;
  onClose: () => void;
  teams: Team[];
  availableModes?: CsvImportMode[];
  defaultMode?: CsvImportMode;
  defaultRosterTeamId?: number | null;
  onSubmitSchedule: (file: File) => Promise<CsvImportResult>;
  onSubmitRoster: (teamId: number, file: File) => Promise<CsvImportResult>;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CsvImportModal({
  open,
  onClose,
  teams,
  availableModes = ["schedule", "roster"],
  defaultMode = "schedule",
  defaultRosterTeamId = null,
  onSubmitSchedule,
  onSubmitRoster,
}: CsvImportModalProps) {
  const { t } = useTranslation();
  const defaultResolvedMode = availableModes.includes(defaultMode) ? defaultMode : availableModes[0];
  const singleTeamId = teams.length === 1 ? teams[0]?.id ?? null : null;
  const [mode, setMode] = useState<CsvImportMode>(defaultResolvedMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [selectedRosterTeamId, setSelectedRosterTeamId] = useState<number | null>(
    defaultRosterTeamId,
  );
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const config = useMemo(() => getCsvImportConfig(mode), [mode]);

  useEffect(() => {
    if (!open) return;

    setMode(defaultResolvedMode);
    setSelectedFile(null);
    setFileInputKey((value) => value + 1);
    setPreview(null);
    setPreviewError(null);
    setParsing(false);
    setSubmitting(false);
    setSubmitError(null);
    setResult(null);
    setSelectedRosterTeamId(defaultRosterTeamId ?? singleTeamId);
  }, [defaultResolvedMode, defaultRosterTeamId, open, singleTeamId]);

  useEffect(() => {
    if (!open || !selectedFile) return;

    let active = true;
    setParsing(true);
    setPreview(null);
    setPreviewError(null);

    void selectedFile
      .text()
      .then((text) => {
        if (!active) return;
        setPreview(buildCsvImportPreview(mode, text));
      })
      .catch(() => {
        if (!active) return;
        setPreviewError(t("csvImport.parseError"));
      })
      .finally(() => {
        if (active) {
          setParsing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, open, selectedFile, t]);

  if (!open) return null;

  const canSubmit =
    Boolean(selectedFile) &&
    !parsing &&
    !submitting &&
    !previewError &&
    (preview?.missingRequiredColumns.length ?? 0) === 0 &&
    (mode !== "schedule" || preview?.headerOrderMatches === true) &&
    (mode !== "roster" || selectedRosterTeamId != null);

  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  const handleDownloadTemplate = () => {
    downloadFile(config.templateFileName, buildCsvTemplate(mode));
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileInputKey((value) => value + 1);
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!selectedFile || !canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    setResult(null);

    try {
      const nextResult =
        mode === "schedule"
          ? await onSubmitSchedule(selectedFile)
          : await onSubmitRoster(selectedRosterTeamId as number, selectedFile);
      setResult(nextResult);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : mode === "schedule"
            ? t("games.importError")
            : t("roster.importError");
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resultVariant = result && result.errors.length > 0 ? "warning" : "success";

  return (
    <div
      className="modal-backdrop csv-import-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("csvImport.title")}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <SurfaceCard className="modal-card surface-card-accent csv-import-modal">
        <div className="csv-import-modal-shell">
          <SectionHeader
            title={t("csvImport.title")}
            description={t("csvImport.description")}
            action={
              <button
                className="game-details-close"
                type="button"
                onClick={handleClose}
                aria-label={t("buttons.close")}
                disabled={submitting}
              >
                <span aria-hidden="true">x</span>
              </button>
            }
          />

          <div className="csv-import-mode-switch" role="tablist" aria-label={t("csvImport.modeLabel")}>
            {availableModes.map((item) => {
              const itemConfig = getCsvImportConfig(item);
              return (
                <button
                  key={item}
                  className={cx("csv-import-mode-button", item === mode && "active")}
                  type="button"
                  role="tab"
                  aria-selected={item === mode}
                  onClick={() => {
                    setMode(item);
                    setSubmitError(null);
                    setResult(null);
                  }}
                >
                  {t(itemConfig.labelKey)}
                </button>
              );
            })}
          </div>

          <Notice variant="info" className="csv-import-mode-description">
            {t(config.descriptionKey)}
          </Notice>

          <div className="csv-import-panel">
            <SectionHeader
              title={t("csvImport.setupTitle")}
              description={t("csvImport.setupDescription")}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={handleDownloadTemplate}
                >
                  {t("csvImport.downloadTemplate")}
                </button>
              }
            />

            <div className="form-grid form-grid-stacked csv-import-setup-grid">
              {mode === "roster" ? (
                <label className="field">
                  <span>{t("csvImport.rosterTeamLabel")}</span>
                  <select
                    value={selectedRosterTeamId ?? ""}
                    onChange={(event) =>
                      setSelectedRosterTeamId(
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                  >
                    <option value="">{t("csvImport.chooseTeam")}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {mode === "roster" && teams.length === 0 ? (
                <Notice variant="warning">{t("csvImport.noTeamsAvailable")}</Notice>
              ) : (
                mode === "roster" && <p className="csv-import-help">{t("csvImport.rosterTeamHelp")}</p>
              )}

              <div className="field">
                <span>{t("csvImport.fileLabel")}</span>
                <label className="file-trigger csv-import-file-trigger">
                  <div className="csv-import-file-copy">
                    <strong>{selectedFile ? t("csvImport.replaceFile") : t("csvImport.chooseFile")}</strong>
                    <span>{selectedFile?.name ?? t("csvImport.noFileSelected")}</span>
                  </div>
                  <input
                    key={fileInputKey}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setSubmitError(null);
                      setResult(null);
                    }}
                  />
                </label>
              </div>

              {selectedFile ? (
                <div className="csv-import-inline-actions">
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={handleClearFile}
                  >
                    {t("csvImport.clearFile")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="csv-import-panel">
            <SectionHeader
              title={t("csvImport.validationTitle")}
              description={t("csvImport.validationDescription")}
            />

            {parsing ? <LoadingState label={t("csvImport.parsing")} /> : null}
            {!parsing && previewError ? <Notice variant="error">{previewError}</Notice> : null}
            {!parsing && !previewError && !selectedFile ? (
              <Notice variant="info">{t("csvImport.previewUnavailable")}</Notice>
            ) : null}

            {!parsing && !previewError && preview ? (
              <div className="csv-import-preview">
                <div className="csv-import-stat-row">
                  <StatPill label={t("csvImport.rowsDetected")} value={preview.rowCount} />
                  <StatPill
                    label={t("csvImport.missingRequired")}
                    value={preview.missingRequiredColumns.length}
                  />
                  <StatPill label={t("csvImport.extraColumns")} value={preview.extraColumns.length} />
                </div>

                <div className="csv-import-row-count-box">
                  <strong>{t("csvImport.rowsToAddTitle")}</strong>
                  <span>{t("csvImport.rowsToAddValue", { count: preview.rowCount })}</span>
                </div>

                <div className="csv-import-preview-group">
                  <h3>{t("csvImport.detectedHeaders")}</h3>
                  <div className="csv-import-chip-list">
                    {preview.headers.length > 0 ? (
                      preview.headers.map((header, index) => (
                        <span className="csv-import-chip" key={`${header}-${index}`}>
                          {header || t("csvImport.unnamedColumn", { count: index + 1 })}
                        </span>
                      ))
                    ) : (
                      <span className="csv-import-muted">{t("csvImport.noHeadersDetected")}</span>
                    )}
                  </div>
                </div>

                {preview.missingRequiredColumns.length > 0 ? (
                  <Notice variant="warning">
                    <strong>{t("csvImport.missingRequired")}:</strong>{" "}
                    {preview.missingRequiredColumns.join(", ")}
                  </Notice>
                ) : (
                  <Notice variant="success">{t("csvImport.readyToImport")}</Notice>
                )}

                {mode === "schedule" && !preview.headerOrderMatches ? (
                  <Notice variant="warning">
                    <strong>{t("csvImport.headerOrderTitle")}</strong>{" "}
                    {t("csvImport.headerOrderValue", {
                      headers: preview.expectedHeaders.join(", "),
                    })}
                  </Notice>
                ) : null}

                {preview.extraColumns.length > 0 ? (
                  <div className="csv-import-preview-group">
                    <h3>{t("csvImport.extraColumns")}</h3>
                    <div className="csv-import-chip-list">
                      {preview.extraColumns.map((header, index) => (
                        <span className="csv-import-chip csv-import-chip-subtle" key={`${header}-${index}`}>
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="csv-import-preview-group">
                  <h3>{t("csvImport.previewTitle")}</h3>
                  {preview.previewRows.length > 0 ? (
                    <div className="table-wrap">
                      <table className="league-table csv-import-preview-table">
                        <thead>
                          <tr>
                            {preview.headers.map((header, index) => (
                              <th key={`${header}-${index}`}>
                                {header || t("csvImport.unnamedColumn", { count: index + 1 })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.previewRows.map((row, rowIndex) => (
                            <tr key={`preview-row-${rowIndex}`}>
                              {preview.headers.map((header, columnIndex) => (
                                <td key={`${header}-${rowIndex}-${columnIndex}`}>
                                  {row[columnIndex] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="csv-import-muted">{t("csvImport.previewEmpty")}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="csv-import-panel">
            <SectionHeader
              title={t("csvImport.schemaTitle")}
              description={t("csvImport.schemaDescription")}
            />

            <div className="table-wrap">
              <table className="league-table csv-import-schema-table">
                <thead>
                  <tr>
                    <th>{t("csvImport.columns.column")}</th>
                    <th>{t("csvImport.columns.required")}</th>
                    <th>{t("csvImport.columns.type")}</th>
                    <th>{t("csvImport.columns.example")}</th>
                    <th>{t("csvImport.columns.notes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {config.schema.map((column) => (
                    <tr key={column.column}>
                      <td><code>{column.column}</code></td>
                      <td>
                        {column.required
                          ? t("csvImport.requiredValue")
                          : t("csvImport.optionalValue")}
                      </td>
                      <td>{t(column.typeKey)}</td>
                      <td><code>{column.example}</code></td>
                      <td>{t(column.notesKey)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {submitError ? <Notice variant="error">{submitError}</Notice> : null}

          {result ? (
            <div className="csv-import-panel">
              <SectionHeader title={t("csvImport.resultsTitle")} />
              <Notice variant={resultVariant}>{t("csvImport.successTitle")}</Notice>
              <div className="csv-import-stat-row">
                <StatPill label={t("common.created")} value={result.created} />
                <StatPill label={t("common.updated")} value={result.updated} />
                <StatPill label={t("common.skipped")} value={result.skipped} />
                <StatPill label={t("common.errors")} value={result.errors.length} />
              </div>
              <p className="csv-import-summary">
                {t("csvImport.summary", {
                  created: result.created,
                  updated: result.updated,
                  skipped: result.skipped,
                  errors: result.errors.length,
                })}
              </p>
              {result.errors.length > 0 ? (
                <ul className="error-list">
                  {result.errors.map((item) => (
                    <li key={`${item.row}-${item.message}`}>
                      {t("common.row", { row: item.row })}: {item.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="form-actions csv-import-modal-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {submitting ? t("common.saveInProgress") : t(config.submitLabelKey)}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleClose}
              disabled={submitting}
            >
              {t("buttons.cancel")}
            </button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
