import { redirect } from "next/navigation";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import { getUserById, listUsers } from "@/lib/users/queries";
import { listTeams } from "@/lib/teams/data";
import { listTiers } from "@/lib/entries/queries";
import { listTemplates } from "@/lib/recurring-templates/data";
import { listSeasonModes } from "@/lib/season-modes/data";
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

  const adminAccess = isAdminPlus(viewer);
  const params = await searchParams;

  // Fetch admin data in parallel if the viewer has access.
  const [staffList, teams, tiers, templates, seasonModes, syncStatus] = adminAccess
    ? await Promise.all([
        listUsers({ limit: 200 }),
        listTeams(),
        listTiers(),
        listTemplates(),
        listSeasonModes(),
        loadSyncStatus(),
      ])
    : [
        { users: [], totalCount: 0 },
        [],
        [],
        [],
        [],
        { pl: null, qb: null },
      ];

  const validTabs = ["profile", "notifications"];
  if (adminAccess) {
    validTabs.push("users", "teams", "templates", "season", "sync");
  }
  const defaultTab =
    params.tab && validTabs.includes(params.tab) ? params.tab : "profile";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
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
              <TabsTrigger value="season">Season</TabsTrigger>
              <TabsTrigger value="sync">Sync</TabsTrigger>
            </>
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
              />
            </TabsContent>
            <TabsContent value="teams">
              <AdminTeamsPanel initialTeams={teams} allUsers={staffList.users} />
            </TabsContent>
            <TabsContent value="templates">
              <AdminTemplatesPanel
                initialTemplates={templates}
                seasonModes={seasonModes}
                tiers={tiers}
                assignableUsers={staffList.users}
              />
            </TabsContent>
            <TabsContent value="season">
              <AdminSeasonPanel initialModes={seasonModes} />
            </TabsContent>
            <TabsContent value="sync">
              <AdminSyncPanel initialLastSync={syncStatus} />
            </TabsContent>
          </>
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
