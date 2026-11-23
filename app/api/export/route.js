import { CSV_COLUMNS, csvField, readEntries } from "../../../lib/entries";

export const dynamic = "force-dynamic";

// Text starting with one of these can run as a formula when the file is
// opened in Excel or Google Sheets. Prefixing an apostrophe makes the
// spreadsheet show it as plain text.
function safeText(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

export async function GET() {
  try {
    const entries = await readEntries();

    const lines = [CSV_COLUMNS.join(",")];
    for (const entry of entries) {
      lines.push(
        CSV_COLUMNS.map((col) =>
          csvField(col === "notes" || col === "location" ? safeText(entry[col]) : entry[col])
        ).join(",")
      );
    }

    // The byte-order mark tells Excel the file is UTF-8, so accented
    // characters in notes display correctly.
    const csv = "﻿" + lines.join("\r\n") + "\r\n";
    const today = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bean-counter-entries-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export failed:", error);
    return Response.json({ error: "Could not export entries" }, { status: 500 });
  }
}
