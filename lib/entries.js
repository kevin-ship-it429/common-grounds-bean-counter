import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

export const CSV_PATH = path.join(process.cwd(), "data", "entries.csv");

export const LOCATIONS = ["Downtown", "Uptown", "Design District", "Bishop Arts"];

const NUMERIC_FIELDS = ["drinks_sold", "revenue", "loyalty_signups", "bags_sold"];

// Parses CSV text into an array of rows (arrays of strings).
// Handles quoted fields containing commas, newlines, and escaped quotes ("").
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop blank lines.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// Maps a location to its canonical spelling ("bishop arts" -> "Bishop Arts").
// Unknown locations are returned trimmed but otherwise unchanged.
export function normalizeLocation(value) {
  const trimmed = String(value ?? "").trim();
  const match = LOCATIONS.find((loc) => loc.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

function toNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// Reads data/entries.csv and returns entry objects in file order.
// Each entry's id is its 1-based data row number in the file.
export async function readEntries() {
  const text = await readFile(CSV_PATH, "utf8");
  const [header, ...dataRows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) {
    return [];
  }
  const columns = header.map((h) => h.trim());

  return dataRows.map((cells, index) => {
    const raw = {};
    columns.forEach((col, i) => {
      raw[col] = cells[i] ?? "";
    });

    const entry = {
      id: index + 1,
      week_of: raw.week_of.trim(),
      location: normalizeLocation(raw.location),
      notes: raw.notes.trim(),
    };
    for (const field of NUMERIC_FIELDS) {
      entry[field] = toNumber(raw[field]);
    }
    return entry;
  });
}

export const CSV_COLUMNS = [
  "week_of",
  "location",
  "drinks_sold",
  "revenue",
  "loyalty_signups",
  "bags_sold",
  "notes",
];

// Quotes a CSV field if it contains a comma, quote, or line break.
export function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Writes are queued so two saves at once can't interleave or get the same id.
let writeQueue = Promise.resolve();

// Appends one validated entry to data/entries.csv and returns it with its id.
export function appendEntry(entry) {
  const task = writeQueue.then(async () => {
    const text = await readFile(CSV_PATH, "utf8");
    const dataRowCount = Math.max(parseCsv(text.replace(/^﻿/, "")).length - 1, 0);

    // Match the file's existing line endings.
    const eol = text.includes("\r\n") || !text.includes("\n") ? "\r\n" : "\n";
    const line = CSV_COLUMNS.map((col) => csvField(entry[col])).join(",");
    const prefix = text.length > 0 && !/\n$/.test(text) ? eol : "";
    await appendFile(CSV_PATH, prefix + line + eol, "utf8");

    return { id: dataRowCount + 1, ...entry };
  });
  writeQueue = task.catch(() => {});
  return task;
}

// Most recent week first; rows within the same week keep their file order.
export function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => b.week_of.localeCompare(a.week_of));
}
