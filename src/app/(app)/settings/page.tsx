import { redirect } from "next/navigation";
import {
  canViewAnalytics,
  getCurrentUser,
  isOperations,
} from "@/lib/auth/current-user";
import {
  authorizedSiteScope,
  isAdminPlusForScope,
} from "@/lib/auth/authorization";
import { getUserById, listUsers } from "@/lib/users/queries";
import { listTeams } from "@/lib/teams/data";
import { listTiers } from "@/lib/entries/queries";
import { listTemplates } from "@/lib/recurring-templates/data";
import { listSeasonModes } from "@/lib/season-modes/data";
import { listChecklistItems } from "@/lib/checklist/data";
import { getGa4Status } from "@/lib/analytics/ga4";
import { listRaptiveUploads } from "@/lib/analytics/raptive";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ProfileForm } from "./profile-form";
import { AdminUsersPanel } from "./admin-users-panel";
import { AdminTeamsPanel } from "./admin-teams-panel";
import { AdminTemplatesPanel } from "./admin-templates-panel";
import { AdminSeasonPanel } from "./admin-season-panel";
import { AdminSyncPanel } from "./admin-sync-panel";
import { AdminChecklistsPanel } from "./admin-checklists-panel";
import { AdminAnalyticsPanel } from "./admin-analytics-panel";
import { NotificationPrefsPanel } from "./notification-prefs-panel";

export const metadata = {
  title: "Settings",
};

type SearchParams = Promise<{ tab?: string }>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const myProfile = await getUserById(viewer.id);
  if (!myProfile) redirect("/login");

  const adminScope = authorizedSiteScope(viewer, "admin", "eic", "operations");
  const adminAccess = adminScope !== null;
  const globalAdminAccess = isAdminPlusForScope(viewer, "both");
  const allowedAdminSites: Array<"pl" | "qb"> =
    adminScope === "both"
      ? ["pl", "qb"]
      : adminScope
        ? [adminScope]
        : [];
  const analyticsAccess = canViewAnalytics(viewer);
  const params = await searchParams;

  // Fetch admin data in parallel if the viewer has access.
  const [rawStaffList, rawTeams, tiers, rawTemplates, seasonModes] =
    adminAccess
      ? await Promise.all([
          listUsers({ limit: 200 }),
          listTeams(),
          listTiers(),
          listTemplates(),
          listSeasonModes(),
        ])
      : [
          { users: [], totalCount: 0 },
          [],
          [],
          [],
          [],
        ];

  const staffUsers = rawStaffList.users.filter(
    (user) =>
      isAdminPlusForScope(viewer, user.wp_site) &&
      user.role_rows.every((row) =>
        isAdminPlusForScope(viewer, row.site),
      ),
  );
  const staffList = { users: staffUsers, totalCount: staffUsers.length };
  const teams = rawTeams.filter((team) =>
    isAdminPlusForScope(viewer, team.site),
  );
  const templates = rawTemplates.filter((template) =>
    isAdminPlusForScope(viewer, template.site),
  );

  const [syncStatus, checklistItems] = globalAdminAccess
    ? await Promise.all([loadSyncStatus(), listChecklistItems()])
    : [{ pl: null, qb: null }, []];

  // Analytics panel — only fetched for EIC/Operations viewers
  const [ga4Status, raptiveUploads] = analyticsAccess
    ? await Promise.all([getGa4Status(), listRaptiveUploads()])
    : [
        { configured: false, connected: false, propertyId: null, lastSyncedAt: null },
        [],
      ];

  const validTabs = ["profile", "notifications"];
  if (adminAccess) {
    validTabs.push("users", "teams", "templates");
  }
  if (globalAdminAccess) {
    validTabs.push("season", "sync", "checklists");
  }
  if (analyticsAccess) {
    validTabs.push("analytics");
  }
  const defaultTab =
    params.tab && validTabs.includes(params.tab) ? params.tab : "profile";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">Settings</h1>
        <p className="mt-1 text-sm text-text-team">
          Manage your profile and — if you&apos;re an admin — user permissions,
          teams, templates, and season mode.
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {adminAccess ? (
            <>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </>
          ) : null}
          {globalAdminAccess ? (
            <>
              <TabsTrigger value="season">Season</TabsTrigger>
              <TabsTrigger value="sync">Sync</TabsTrigger>
              <TabsTrigger value="checklists">Checklists</TabsTrigger>
            </>
          ) : null}
          {analyticsAccess ? (
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm profile={myProfile} />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationPrefsPanel userId={viewer.id} />
        </TabsContent>

        {adminAccess ? (
          <>
            <TabsContent value="users">
              <AdminUsersPanel
                initialUsers={staffList.users}
                totalCount={staffList.totalCount}
                allowedSites={allowedAdminSites}
              />
            </TabsContent>
            <TabsContent value="teams">
              <AdminTeamsPanel
                initialTeams={teams}
                allUsers={staffList.users}
                allowedSites={allowedAdminSites}
              />
            </TabsContent>
            <TabsContent value="templates">
              <AdminTemplatesPanel
                initialTemplates={templates}
                seasonModes={seasonModes}
                tiers={tiers}
                assignableUsers={staffList.users}
                allowedSites={allowedAdminSites}
                canRunGenerator={globalAdminAccess}
              />
            </TabsContent>
          </>
        ) : null}
        {globalAdminAccess ? (
          <>
            <TabsContent value="season">
              <AdminSeasonPanel initialModes={seasonModes} />
            </TabsContent>
            <TabsContent value="sync">
              <AdminSyncPanel
                initialLastSync={syncStatus}
                canRunHistoricalImport={isOperations(viewer)}
              />
            </TabsContent>
            <TabsContent value="checklists">
              <AdminChecklistsPanel
                initialItems={checklistItems}
                tiers={tiers}
              />
            </TabsContent>
          </>
        ) : null}
        {analyticsAccess ? (
          <TabsContent value="analytics">
            <AdminAnalyticsPanel
              initialGa4Status={ga4Status}
              initialUploads={raptiveUploads}
              canConnectGa4={isOperations(viewer)}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

async function loadSyncStatus(): Promise<{
  pl: string | null;
  qb: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("global_settings")
    .select("key, value")
    .in("key", ["wp_last_sync_pl", "wp_last_sync_qb"]);

  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  const pl = rows.find((r) => r.key === "wp_last_sync_pl");
  const qb = rows.find((r) => r.key === "wp_last_sync_qb");
  return {
    pl: (pl?.value as string | null) ?? null,
    qb: (qb?.value as string | null) ?? null,
  };
}
