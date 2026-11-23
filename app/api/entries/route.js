import { LOCATIONS, appendEntry, readEntries, sortNewestFirst } from "../../../lib/entries";

export const dynamic = "force-dynamic";

const NOTES_MAX_LENGTH = 500;

export async function GET() {
  try {
    const entries = sortNewestFirst(await readEntries());
    return Response.json({ entries });
  } catch (error) {
    console.error("GET /api/entries failed:", error);
    return Response.json({ error: "Could not read entries" }, { status: 500 });
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Returns { entry } on success or { errors } listing what's wrong.
function validate(body) {
  const errors = [];
  const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

  const week_of = text(body.week_of);
  if (!week_of) {
    errors.push("Week of is required.");
  } else if (!isValidDate(week_of)) {
    errors.push("Week of must be a valid date (YYYY-MM-DD).");
  }

  const locationInput = text(body.location);
  const location = LOCATIONS.find((l) => l.toLowerCase() === locationInput.toLowerCase());
  if (!locationInput) {
    errors.push("Café is required.");
  } else if (!location) {
    errors.push("Café must be one of: " + LOCATIONS.join(", ") + ".");
  }

  const numberField = (key, label, { integer }) => {
    const raw = text(body[key]);
    if (raw === "") {
      errors.push(label + " is required.");
      return null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      errors.push(label + " must be a number of 0 or more.");
      return null;
    }
    if (integer && !Number.isInteger(num)) {
      errors.push(label + " must be a whole number.");
      return null;
    }
    return num;
  };

  const drinks_sold = numberField("drinks_sold", "Drinks sold", { integer: true });
  const revenue = numberField("revenue", "Revenue", { integer: false });
  const loyalty_signups = numberField("loyalty_signups", "Loyalty signups", { integer: true });
  const bags_sold = numberField("bags_sold", "Bags sold", { integer: true });

  // The form is a single-line input; collapse any line breaks to spaces.
  const notes = text(body.notes).replace(/\s*[\r\n]+\s*/g, " ");
  if (notes.length > NOTES_MAX_LENGTH) {
    errors.push("Notes must be " + NOTES_MAX_LENGTH + " characters or fewer.");
  }

  if (errors.length > 0) {
    return { errors };
  }
  return {
    entry: { week_of, location, drinks_sold, revenue, loyalty_signups, bags_sold, notes },
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { entry, errors } = validate(body);
  if (errors) {
    return Response.json({ error: errors.join(" "), errors }, { status: 400 });
  }

  try {
    const saved = await appendEntry(entry);
    return Response.json({ entry: saved }, { status: 201 });
  } catch (error) {
    console.error("POST /api/entries failed:", error);
    if (error && (error.code === "EBUSY" || error.code === "EPERM")) {
      return Response.json(
        { error: "entries.csv is locked by another program (is it open in Excel?). Close it and try again." },
        { status: 503 }
      );
    }
    return Response.json({ error: "Could not save the entry." }, { status: 500 });
  }
}
