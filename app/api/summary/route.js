import { LOCATIONS, readEntries } from "../../../lib/entries";

export const dynamic = "force-dynamic";

const MONTHLY_REVENUE_GOAL = 50000;

function sum(entries, field) {
  return entries.reduce((total, entry) => total + (entry[field] ?? 0), 0);
}

export async function GET() {
  try {
    const entries = (await readEntries()).filter((e) => e.week_of);

    if (entries.length === 0) {
      return Response.json({
        latest_week: null,
        drinks_latest_week: null,
        revenue_latest_week: null,
        month: null,
        revenue_month_to_date: null,
        monthly_goal: MONTHLY_REVENUE_GOAL,
        goal_progress_pct: null,
        by_location: [],
      });
    }

    // week_of is YYYY-MM-DD, so string comparison orders dates correctly.
    const latestWeek = entries.reduce(
      (max, e) => (e.week_of > max ? e.week_of : max),
      entries[0].week_of
    );
    const latestEntries = entries.filter((e) => e.week_of === latestWeek);

    // A week counts toward the month its week_of date falls in.
    const month = latestWeek.slice(0, 7);
    const monthEntries = entries.filter((e) => e.week_of.startsWith(month));
    const revenueMonth = sum(monthEntries, "revenue");

    // Combine multiple rows for the same café (e.g. resubmitted totals).
    const revenueByLocation = new Map();
    for (const entry of latestEntries) {
      revenueByLocation.set(
        entry.location,
        (revenueByLocation.get(entry.location) ?? 0) + (entry.revenue ?? 0)
      );
    }
    const rank = (loc) => {
      const i = LOCATIONS.indexOf(loc);
      return i === -1 ? LOCATIONS.length : i;
    };
    const byLocation = [...revenueByLocation]
      .map(([location, revenue]) => ({ location, revenue }))
      .sort((a, b) => rank(a.location) - rank(b.location) || a.location.localeCompare(b.location));

    return Response.json({
      latest_week: latestWeek,
      drinks_latest_week: sum(latestEntries, "drinks_sold"),
      revenue_latest_week: sum(latestEntries, "revenue"),
      month,
      revenue_month_to_date: revenueMonth,
      monthly_goal: MONTHLY_REVENUE_GOAL,
      goal_progress_pct: (revenueMonth / MONTHLY_REVENUE_GOAL) * 100,
      by_location: byLocation,
    });
  } catch (error) {
    console.error("GET /api/summary failed:", error);
    return Response.json({ error: "Could not build summary" }, { status: 500 });
  }
}
