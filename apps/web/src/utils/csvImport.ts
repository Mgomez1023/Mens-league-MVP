export type CsvImportMode = "schedule" | "roster";

export type CsvImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export type CsvImportColumnConfig = {
  column: string;
  required: boolean;
  typeKey: string;
  example: string;
  notesKey: string;
};

export type CsvImportModeConfig = {
  mode: CsvImportMode;
  labelKey: string;
  descriptionKey: string;
  submitLabelKey: string;
  templateFileName: string;
  schema: CsvImportColumnConfig[];
  exampleRows: Array<Record<string, string>>;
};

export type CsvImportPreview = {
  headers: string[];
  normalizedHeaders: string[];
  expectedHeaders: string[];
  headerOrderMatches: boolean;
  missingRequiredColumns: string[];
  extraColumns: string[];
  rowCount: number;
  previewRows: string[][];
};

export function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeScheduleDateValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return trimmed;

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export const scheduleSchemaConfig: CsvImportModeConfig = {
  mode: "schedule",
  labelKey: "csvImport.modes.schedule",
  descriptionKey: "csvImport.modeDescriptions.schedule",
  submitLabelKey: "csvImport.submitSchedule",
  templateFileName: "schedule-import-template.csv",
  schema: [
    {
      column: "week",
      required: true,
      typeKey: "csvImport.types.integer",
      example: "1",
      notesKey: "csvImport.scheduleNotes.week",
    },
    {
      column: "date",
      required: true,
      typeKey: "csvImport.types.date",
      example: "04/05/2026",
      notesKey: "csvImport.scheduleNotes.date",
    },
    {
      column: "day",
      required: true,
      typeKey: "csvImport.types.text",
      example: "Sunday",
      notesKey: "csvImport.scheduleNotes.day",
    },
    {
      column: "start time",
      required: true,
      typeKey: "csvImport.types.time",
      example: "09:00",
      notesKey: "csvImport.scheduleNotes.time",
    },
    {
      column: "field",
      required: true,
      typeKey: "csvImport.types.text",
      example: "Field 1",
      notesKey: "csvImport.scheduleNotes.field",
    },
    {
      column: "home",
      required: true,
      typeKey: "csvImport.types.teamName",
      example: "La Aduana",
      notesKey: "csvImport.scheduleNotes.homeTeam",
    },
    {
      column: "away",
      required: true,
      typeKey: "csvImport.types.teamName",
      example: "8 Ballers",
      notesKey: "csvImport.scheduleNotes.awayTeam",
    },
  ],
  exampleRows: [
    {
      week: "1",
      date: "04/05/2026",
      day: "Sunday",
      "start time": "09:00",
      field: "Field 1",
      home: "La Aduana",
      away: "8 Ballers",
    },
    {
      week: "2",
      date: "04/12/2026",
      day: "Sunday",
      "start time": "13:30",
      field: "Field 2",
      home: "Aztecs",
      away: "Los Amigos",
    },
  ],
};

export const rosterSchemaConfig: CsvImportModeConfig = {
  mode: "roster",
  labelKey: "csvImport.modes.roster",
  descriptionKey: "csvImport.modeDescriptions.roster",
  submitLabelKey: "csvImport.submitRoster",
  templateFileName: "roster-import-template.csv",
  schema: [
    {
      column: "first_name",
      required: true,
      typeKey: "csvImport.types.text",
      example: "Jose",
      notesKey: "csvImport.rosterNotes.firstName",
    },
    {
      column: "last_name",
      required: true,
      typeKey: "csvImport.types.text",
      example: "Ramirez",
      notesKey: "csvImport.rosterNotes.lastName",
    },
    {
      column: "number",
      required: false,
      typeKey: "csvImport.types.integer",
      example: "12",
      notesKey: "csvImport.rosterNotes.number",
    },
    {
      column: "position",
      required: false,
      typeKey: "csvImport.types.text",
      example: "SS",
      notesKey: "csvImport.rosterNotes.position",
    },
    {
      column: "bats",
      required: false,
      typeKey: "csvImport.types.handedness",
      example: "R",
      notesKey: "csvImport.rosterNotes.bats",
    },
    {
      column: "throws",
      required: false,
      typeKey: "csvImport.types.handedness",
      example: "R",
      notesKey: "csvImport.rosterNotes.throws",
    },
  ],
  exampleRows: [
    {
      first_name: "Jose",
      last_name: "Ramirez",
      number: "12",
      position: "SS",
      bats: "R",
      throws: "R",
    },
    {
      first_name: "Luis",
      last_name: "Martinez",
      number: "34",
      position: "P",
      bats: "L",
      throws: "L",
    },
  ],
};

export const csvImportModeConfigs: Record<CsvImportMode, CsvImportModeConfig> = {
  schedule: scheduleSchemaConfig,
  roster: rosterSchemaConfig,
};

export function getCsvImportConfig(mode: CsvImportMode) {
  return csvImportModeConfigs[mode];
}

function escapeCsvValue(value: string) {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

export function buildCsvTemplate(mode: CsvImportMode) {
  const config = getCsvImportConfig(mode);
  const headers = config.schema.map((column) => column.column);
  const lines = [headers.join(",")];

  for (const row of config.exampleRows) {
    lines.push(
      headers
        .map((header) => escapeCsvValue(row[header] ?? ""))
        .join(","),
    );
  }

  return lines.join("\r\n");
}

export function buildCsvText(rows: string[][]) {
  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");
}

export function parseCsvText(rawText: string) {
  const text = rawText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          value += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field");
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function isEmptyRow(row: string[]) {
  return row.every((cell) => cell.trim() === "");
}

export function buildCsvImportPreview(mode: CsvImportMode, rawText: string): CsvImportPreview {
  const rows = parseCsvText(rawText);
  const expectedHeaders = getCsvImportConfig(mode).schema.map((column) => column.column);
  const normalizedExpectedHeaders = expectedHeaders.map((header) => normalizeCsvHeader(header));
  if (rows.length === 0) {
    return {
      headers: [],
      normalizedHeaders: [],
      expectedHeaders,
      headerOrderMatches: false,
      missingRequiredColumns: getCsvImportConfig(mode).schema
        .filter((column) => column.required)
        .map((column) => column.column),
      extraColumns: [],
      rowCount: 0,
      previewRows: [],
    };
  }

  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((header) => header.trim());
  const normalizedHeaders = headers.map((header) => normalizeCsvHeader(header));
  const normalizedHeaderSet = new Set(normalizedHeaders.filter(Boolean));
  const schema = getCsvImportConfig(mode).schema;
  const knownColumns = new Set(schema.map((column) => normalizeCsvHeader(column.column)));
  const missingRequiredColumns = schema
    .filter((column) => column.required)
    .map((column) => normalizeCsvHeader(column.column))
    .filter((column) => !normalizedHeaderSet.has(column));

  const extraColumns = headers.filter((_, index) => {
    const normalized = normalizedHeaders[index];
    return normalized !== "" && !knownColumns.has(normalized);
  });
  const headerOrderMatches =
    normalizedHeaders.length === normalizedExpectedHeaders.length &&
    normalizedHeaders.every((header, index) => header === normalizedExpectedHeaders[index]);

  const nonEmptyRows = bodyRows.filter((row) => !isEmptyRow(row));

  return {
    headers,
    normalizedHeaders,
    expectedHeaders,
    headerOrderMatches,
    missingRequiredColumns,
    extraColumns,
    rowCount: nonEmptyRows.length,
    previewRows: nonEmptyRows.slice(0, 3),
  };
}

export function transformScheduleCsvForImport(rawText: string) {
  const rows = parseCsvText(rawText);
  if (rows.length === 0) {
    return "";
  }

  const [headerRow, ...bodyRows] = rows;
  const headerIndexes = new Map<string, number>();
  headerRow.forEach((header, index) => {
    headerIndexes.set(normalizeCsvHeader(header), index);
  });

  const outputRows: string[][] = [["date", "time", "home_team", "away_team", "field"]];

  for (const row of bodyRows) {
    if (isEmptyRow(row)) continue;

    outputRows.push([
      normalizeScheduleDateValue(row[headerIndexes.get("date") ?? -1] ?? ""),
      row[headerIndexes.get("start_time") ?? -1] ?? "",
      row[headerIndexes.get("home") ?? -1] ?? "",
      row[headerIndexes.get("away") ?? -1] ?? "",
      row[headerIndexes.get("field") ?? -1] ?? "",
    ]);
  }

  return buildCsvText(outputRows);
}
