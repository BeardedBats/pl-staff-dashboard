import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const ACCESS_SECRET = "browser-test-access-secret-at-least-32-characters";
const AUTH_DIRECTORY = path.join(process.cwd(), "test-results", "auth");
const tableArchiveEntryIds = Array.from(
  { length: 26 },
  (_, index) =>
    `28700000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
);

export const browserActors = {
  writer: {
    userId: "28000000-0000-0000-0000-000000000001",
    sessionId: "28100000-0000-0000-0000-000000000001",
    displayName: "Writer Journey",
    role: "writer",
  },
  manager: {
    userId: "28000000-0000-0000-0000-000000000002",
    sessionId: "28100000-0000-0000-0000-000000000002",
    displayName: "Manager Journey",
    role: "manager",
  },
  editor: {
    userId: "28000000-0000-0000-0000-000000000003",
    sessionId: "28100000-0000-0000-0000-000000000003",
    displayName: "Editor Journey",
    role: "editor",
  },
  graphics: {
    userId: "28000000-0000-0000-0000-000000000004",
    sessionId: "28100000-0000-0000-0000-000000000004",
    displayName: "Graphics Journey",
    role: "graphics",
  },
  admin: {
    userId: "28000000-0000-0000-0000-000000000005",
    sessionId: "28100000-0000-0000-0000-000000000005",
    displayName: "Admin Journey",
    role: "admin",
  },
  eic: {
    userId: "28000000-0000-0000-0000-000000000006",
    sessionId: "28100000-0000-0000-0000-000000000006",
    displayName: "EIC Journey",
    role: "eic",
  },
} as const;

export const browserRecords = {
  writerEntryId: "28200000-0000-0000-0000-000000000001",
  managerEntryId: "28200000-0000-0000-0000-000000000002",
  editorEntryId: "28200000-0000-0000-0000-000000000003",
  graphicsEntryId: "28200000-0000-0000-0000-000000000004",
  managerClaimId: "28300000-0000-0000-0000-000000000001",
  graphicRequestId: "28400000-0000-0000-0000-000000000001",
  analyticsEntryId: "28200000-0000-0000-0000-000000000005",
  analyticsRowId: "28500000-0000-0000-0000-000000000001",
  revenueRowId: "28600000-0000-0000-0000-000000000001",
  financialSentinel: 731.2942,
  tableArchiveEntryIds,
} as const;

function localServiceRoleKey(): string {
  const inspected = JSON.parse(
    execFileSync(
      "docker",
      ["inspect", "supabase_kong_pl-staff-dashboard"],
      { encoding: "utf8" },
    ),
  )[0];
  const configuration = JSON.stringify(
    inspected?.Config?.Entrypoint ?? inspected?.Config?.Cmd ?? [],
  );
  const key = configuration.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0];
  if (!key) throw new Error("Local Supabase service key was not found");
  return key;
}

function localAdmin() {
  return createClient("http://127.0.0.1:54321", localServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function accessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { sub: userId, sid: sessionId, kind: "access" },
    ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "15m",
      issuer: "pl-staff-dashboard",
      jwtid: randomUUID(),
    },
  );
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function expectWrite(
  operation: PromiseLike<{ error: { message: string } | null }>,
  label: string,
) {
  const { error } = await operation;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export default async function globalSetup() {
  const supabase = localAdmin();
  const userIds = Object.values(browserActors).map((actor) => actor.userId);
  const entryIds = [
    browserRecords.writerEntryId,
    browserRecords.managerEntryId,
    browserRecords.editorEntryId,
    browserRecords.graphicsEntryId,
    browserRecords.analyticsEntryId,
  ];

  await expectWrite(
    supabase
      .from("raptive_revenue")
      .delete()
      .eq("id", browserRecords.revenueRowId),
    "remove stale browser revenue",
  );
  await expectWrite(
    supabase
      .from("article_analytics")
      .delete()
      .eq("id", browserRecords.analyticsRowId),
    "remove stale browser analytics",
  );

  await expectWrite(
    supabase.from("entries").delete().in("id", entryIds),
    "remove stale browser entries",
  );
  await expectWrite(
    supabase.from("entries").delete().like("title", "E2E P2.8%"),
    "remove prior generated browser entries",
  );
  await expectWrite(
    supabase.from("entries").delete().like("title", "E2E P3.7 table row%"),
    "remove prior table browser entries",
  );
  await expectWrite(
    supabase.from("users").delete().in("id", userIds),
    "remove stale browser actors",
  );

  await expectWrite(
    supabase.from("users").insert(
      Object.values(browserActors).map((actor, index) => ({
        id: actor.userId,
        wp_user_id: 28_001 + index,
        wp_site: actor.role === "admin" ? "both" : "pl",
        email: `${actor.role}-journey@example.test`,
        display_name: actor.displayName,
        onboarding_completed: true,
      })),
    ),
    "insert browser actors",
  );
  await expectWrite(
    supabase.from("user_roles").insert(
      Object.values(browserActors).map((actor) => ({
        user_id: actor.userId,
        role: actor.role,
        site: actor.role === "admin" ? "both" : "pl",
      })),
    ),
    "insert browser roles",
  );

  const tokens = Object.fromEntries(
    Object.entries(browserActors).map(([name, actor]) => [
      name,
      accessToken(actor.userId, actor.sessionId),
    ]),
  );
  await expectWrite(
    supabase.from("sessions").insert(
      Object.entries(browserActors).map(([name, actor]) => ({
        id: actor.sessionId,
        user_id: actor.userId,
        token_hash: hash(tokens[name]),
        refresh_token_hash: hash(`browser-refresh-${name}-${randomUUID()}`),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })),
    ),
    "insert browser sessions",
  );

  const { data: tier, error: tierError } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "C")
    .single();
  if (tierError || !tier) {
    throw new Error(`load browser tier: ${tierError?.message ?? "not found"}`);
  }

  await expectWrite(
    supabase.from("entries").insert([
      {
        id: browserRecords.writerEntryId,
        title: "E2E P2.8 writer submission",
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "claimed",
        editor_status: "none",
        publish_date_precision: "none",
      },
      {
        id: browserRecords.managerEntryId,
        title: "E2E P2.8 manager approval",
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "claim_requested",
        editor_status: "none",
        publish_date_precision: "none",
      },
      {
        id: browserRecords.editorEntryId,
        title: "E2E P2.8 editor completion",
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "submitted",
        editor_status: "ready_for_edit",
        publish_date_precision: "none",
      },
      {
        id: browserRecords.graphicsEntryId,
        title: "E2E P2.8 graphics claim",
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "claimed",
        editor_status: "none",
        publish_date_precision: "none",
      },
      {
        id: browserRecords.analyticsEntryId,
        title: "E2E P3.6 gated financial sentinel",
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "published",
        editor_status: "published",
        publish_date: new Date().toISOString(),
        publish_date_precision: "exact",
        wp_post_url: "https://pitcherlist.com/e2e-p3-6-financial-sentinel/",
      },
    ]),
    "insert browser entries",
  );
  await expectWrite(
    supabase.from("entries").insert(
      browserRecords.tableArchiveEntryIds.map((id, index) => ({
        id,
        title: `E2E P3.7 table row ${String(index + 1).padStart(2, "0")}`,
        site: "pl",
        tier_id: tier.id,
        created_by: browserActors.admin.userId,
        content_status: "published",
        editor_status: "published",
        publish_date: new Date(
          Date.now() - index * 60 * 60 * 1000,
        ).toISOString(),
        publish_date_precision: "exact",
        is_archived: true,
        archive_reason: "P3.7 pagination and table-system proof",
      })),
    ),
    "insert table browser entries",
  );
  const analyticsDate = new Date().toISOString().slice(0, 10);
  await expectWrite(
    supabase.from("article_analytics").insert({
      id: browserRecords.analyticsRowId,
      entry_id: browserRecords.analyticsEntryId,
      date: analyticsDate,
      pageviews: 1_337,
      sessions: 0,
      avg_time_on_page: 73.6,
    }),
    "insert browser analytics sentinel",
  );
  await expectWrite(
    supabase.from("raptive_revenue").insert({
      id: browserRecords.revenueRowId,
      entry_id: browserRecords.analyticsEntryId,
      date: analyticsDate,
      page_url: "https://pitcherlist.com/e2e-p3-6-financial-sentinel/",
      earnings: browserRecords.financialSentinel,
      rpm: 802.7379,
      page_rpm: 546.9665,
      sessions: 911,
      pageviews: 1_337,
    }),
    "insert browser revenue sentinel",
  );
  await expectWrite(
    supabase.from("entry_authors").insert([
      {
        entry_id: browserRecords.writerEntryId,
        user_id: browserActors.writer.userId,
        role: "primary",
      },
      {
        entry_id: browserRecords.editorEntryId,
        user_id: browserActors.writer.userId,
        role: "primary",
      },
    ]),
    "insert browser authors",
  );
  await expectWrite(
    supabase.from("claims").insert({
      id: browserRecords.managerClaimId,
      entry_id: browserRecords.managerEntryId,
      user_id: browserActors.writer.userId,
      role_type: "writer",
      status: "pending",
    }),
    "insert manager claim",
  );
  await expectWrite(
    supabase.from("graphic_requests").insert({
      id: browserRecords.graphicRequestId,
      entry_id: browserRecords.graphicsEntryId,
      title: "E2E P2.8 featured image",
      description: "Claim this fixture without contacting WordPress.",
      graphic_status: "needed",
      created_by: browserActors.admin.userId,
    }),
    "insert graphic request",
  );

  await mkdir(AUTH_DIRECTORY, { recursive: true });
  const expires = Math.floor(Date.now() / 1000) + 15 * 60;
  await Promise.all(
    Object.keys(browserActors).map((name) =>
      writeFile(
        path.join(AUTH_DIRECTORY, `${name}.json`),
        JSON.stringify({
          cookies: [
            {
              name: "pl_at",
              value: tokens[name],
              domain: "127.0.0.1",
              path: "/",
              expires,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }),
        "utf8",
      ),
    ),
  );

  return async () => {
    const cleanup = localAdmin();
    await cleanup
      .from("raptive_revenue")
      .delete()
      .eq("id", browserRecords.revenueRowId);
    await cleanup.from("entries").delete().like("title", "E2E P2.8%");
    await cleanup
      .from("entries")
      .delete()
      .like("title", "E2E P3.7 table row%");
    await cleanup
      .from("entries")
      .delete()
      .eq("id", browserRecords.analyticsEntryId);
    await cleanup.from("users").delete().in("id", userIds);
    await rm(AUTH_DIRECTORY, { recursive: true, force: true });
  };
}
