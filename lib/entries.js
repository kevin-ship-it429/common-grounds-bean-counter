// Entries are stored in the Supabase table `entries`, accessed through
// Supabase's REST API. Credentials come from SUPABASE_URL and
// SUPABASE_SECRET_KEY (.env.local locally, environment variables on Netlify).

const TABLE = "entries";

export const LOCATIONS = ["Downtown", "Uptown", "Design District", "Bishop Arts"];

export const CSV_COLUMNS = [
  "week_of",
  "location",
  "drinks_sold",
  "revenue",
  "loyalty_signups",
  "bags_sold",
  "notes",
];

const NUMERIC_FIELDS = ["drinks_sold", "revenue", "loyalty_signups", "bags_sold"];

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }
  const headers = { apikey: key, "Content-Type": "application/json" };
  // Legacy keys (JWTs starting "eyJ") also go in the Authorization header.
  // Newer sb_secret_ keys only go in the apikey header.
  if (key.startsWith("eyJ")) {
    headers.Authorization = "Bearer " + key;
  }
  return { baseUrl: url.replace(/\/+$/, "") + "/rest/v1/" + TABLE, headers };
}

async function supabaseRequest(query, options = {}) {
  const { baseUrl, headers } = supabaseConfig();
  const response = await fetch(baseUrl + query, {
    ...options,
    headers: { ...headers, ...options.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }
  return response.json();
}

// Maps a location to its canonical spelling ("bishop arts" -> "Bishop Arts").
// Unknown locations are returned trimmed but otherwise unchanged.
export function normalizeLocation(value) {
  const trimmed = String(value ?? "").trim();
  const match = LOCATIONS.find((loc) => loc.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function fromRow(row) {
  const entry = {
    id: row.id,
    week_of: String(row.week_of ?? "").slice(0, 10),
    location: normalizeLocation(row.location),
    notes: row.notes ?? "",
  };
  for (const field of NUMERIC_FIELDS) {
    entry[field] = toNumber(row[field]);
  }
  return entry;
}

// Returns every entry, oldest first (by week, then in the order they were added).
export async function readEntries() {
  const columns = ["id", ...CSV_COLUMNS].join(",");
  const rows = await supabaseRequest(`?select=${columns}&order=week_of.asc,id.asc`);
  return rows.map(fromRow);
}

// Inserts one validated entry and returns it as saved, including its new id.
export async function appendEntry(entry) {
  const row = { ...entry, notes: entry.notes ? entry.notes : null };
  const [saved] = await supabaseRequest("", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return fromRow(saved);
}

// Quotes a CSV field if it contains a comma, quote, or line break.
export function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Most recent week first; rows within the same week keep the order they were added.
export function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => b.week_of.localeCompare(a.week_of));
}
