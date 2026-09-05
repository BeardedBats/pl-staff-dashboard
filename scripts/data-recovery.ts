import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { syncGa4 } from "../src/lib/analytics/ga4";
import { getRaptiveLiveStatus, syncRaptiveConnection } from "../src/lib/analytics/raptive-live";
import { syncWpPostsForSite } from "../src/lib/wp-sync/posts";
import { env } from "../src/lib/env";
import { importWpUser } from "../src/lib/users/mutations";

const apply = process.argv.includes("--apply") || process.env.PL_RECOVERY_APPLY === "1";
const action = process.argv.find((arg) => arg.startsWith("--action="))?.slice(9) ?? process.env.PL_RECOVERY_ACTION;
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("ovnwmayhbmbdzbxrfrul.supabase.co")) throw new Error("Unexpected recovery project");
const db = getSupabaseAdmin();
if (action === "ga4") {
  const coverage = await db.rpc("get_ga4_coverage_health");
  if (coverage.error) throw new Error("Coverage check failed");
  console.log(JSON.stringify({ action, apply, coverage: coverage.data }));
  if (apply) {
    const value = coverage.data as { firstMissingDate?: string; lastMissingDate?: string };
    if (value.firstMissingDate && value.lastMissingDate) {
      for (let start = Date.parse(value.firstMissingDate); start <= Date.parse(value.lastMissingDate); start += 7 * 86_400_000) {
        const from = new Date(start).toISOString().slice(0, 10);
        const to = new Date(Math.min(start + 6 * 86_400_000, Date.parse(value.lastMissingDate))).toISOString().slice(0, 10);
        const result = await syncGa4(from, to);
        console.log(JSON.stringify({ from, to, ...result }));
        if (!result.ok) throw new Error("GA4 recovery stopped. Completed windows remain saved.");
      }
    }
    console.log(JSON.stringify({ verifiedCoverage: (await db.rpc("get_ga4_coverage_health")).data }));
  }
} else if (action === "raptive") {
  const status = await getRaptiveLiveStatus();
  const connection = status.connections.find((row) => row.wpSite === "pl" && row.enabled);
  const dates = ["2026-08-17", "2026-08-24"];
  console.log(JSON.stringify({ action, apply, dates }));
  if (apply && connection) for (const date of dates) {
      const result = await syncRaptiveConnection(connection, date);
      console.log(JSON.stringify(result));
      if (!result.ok) throw new Error("Raptive recovery stopped");
  } else if (apply) {
    // Sensitive Raptive env values cannot be downloaded. Use the real production
    // login and authorized recovery API; never forge or print session credentials.
    const base = "https://pl-staff-dashboard.vercel.app";
    const login = await fetch(`${base}/api/auth/login`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: env.WP_PL_USERNAME, password: env.WP_PL_APP_PASSWORD }),
    });
    if (!login.ok) throw new Error(`Recovery login failed (${login.status})`);
    const cookie = login.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
    try {
      for (const date of dates) {
        const response = await fetch(`${base}/api/raptive/live/sync`, { method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie, Origin: base },
          body: JSON.stringify({ wpSite: "pl", date }),
        });
        const result = await response.json();
        console.log(JSON.stringify({ date, status: response.status, ok: result.ok,
          insertedRows: result.insertedRows, matchedRows: result.matchedRows, totalEarnings: result.totalEarnings, errorCode: result.errorCode }));
        if (!response.ok) throw new Error("Raptive recovery stopped");
      }
    } finally { await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: base } }); }
  }
} else if (action === "wordpress") {
  const operator = await db.from("user_roles").select("user_id").eq("role", "operations").eq("site", "pl").limit(1).single();
  if (!operator.data || operator.error) throw new Error("PL operator not found");
  console.log(JSON.stringify({ action, apply, modifiedSince: "2026-07-31T00:00:00" }));
  if (apply) {
    const result = await syncWpPostsForSite("pl", operator.data.user_id, "2026-07-31T00:00:00");
    console.log(JSON.stringify(result));
    if (result.errors.length) throw new Error("WordPress recovery has unresolved errors");
  }
} else if (action === "authors") {
  const entries: Array<{ id: string; wp_post_id: number | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("entries").select("id,wp_post_id").eq("site", "pl").not("wp_post_id", "is", null).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Could not load article identities");
    entries.push(...result.data); if (result.data.length < 1000) break;
  }
  const linked = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("entry_authors").select("entry_id").eq("role", "primary").order("entry_id").range(offset, offset + 999);
    if (result.error) throw new Error("Could not load existing author assignments");
    result.data.forEach((row) => linked.add(row.entry_id)); if (result.data.length < 1000) break;
  }
  const pending = entries.filter((entry) => !linked.has(entry.id));
  const postAuthors = new Map<number, number>();
  for (let offset = 0; offset < pending.length; offset += 100) {
    const ids = pending.slice(offset, offset + 100).map((entry) => entry.wp_post_id).join(",");
    const response = await fetch(`${env.WP_PL_URL}/wp-json/wp/v2/posts?context=edit&status=publish,future,draft,pending&per_page=100&include=${ids}&_fields=id,author`, {
      headers: { Authorization: `Basic ${Buffer.from(`${env.WP_PL_USERNAME}:${env.WP_PL_APP_PASSWORD}`).toString("base64")}` },
    });
    if (!response.ok) throw new Error(`WordPress author lookup failed (${response.status})`);
    for (const post of await response.json() as Array<{ id: number; author: number }>) postAuthors.set(post.id, post.author);
  }
  const wpAuthors = [...new Set(postAuthors.values())];
  console.log(JSON.stringify({ action, apply, entriesNeedingAuthors: pending.length, foundWordPressPosts: postAuthors.size, distinctWordPressAuthors: wpAuthors.length }));
  if (apply) {
    const authors = new Map<number, string>();
    let created = 0;
    const unresolvedAuthors: number[] = [];
    for (const wpUserId of wpAuthors) {
      const imported = await importWpUser("pl", { wpUserId }, { assignRole: false });
      if (imported.ok) { authors.set(wpUserId, imported.userId); if (imported.created) created++; }
      else unresolvedAuthors.push(wpUserId);
    }
    let linkedCount = 0;
    for (const entry of pending) {
      const authorId = postAuthors.get(entry.wp_post_id!);
      const userId = authorId === undefined ? null : authors.get(authorId);
      if (!userId) continue;
      const result = await db.from("entry_authors").upsert({ entry_id: entry.id, user_id: userId, role: "primary" }, { onConflict: "entry_id,user_id", ignoreDuplicates: true });
      // The database's unique-primary constraint protects concurrent manual assignments.
      if (result.error) throw new Error("Author repair stopped on a write conflict; existing assignments were preserved");
      linkedCount++;
    }
    console.log(JSON.stringify({ createdDirectoryRecords: created, grantedRoles: 0, repairedAuthorLinks: linkedCount, unresolvedWordPressAuthorIds: unresolvedAuthors }));
    const reconciled = await db.rpc("reconcile_raptive_entry_links");
    if (reconciled.error) throw new Error("Author repair saved; revenue reconciliation needs retry");
    console.log(JSON.stringify({ revenueReconciliation: reconciled.data }));
  }
} else throw new Error("Choose --action=ga4, raptive, wordpress, or authors. Dry run is the default.");
