import { redirect } from "next/navigation";
import Link from "next/link";
import { SettingsTabs } from "./settings-tabs";
import { getCurrentUser } from "@/lib/auth/current-user";
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
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ProfileForm } from "./profile-form";
import { AdminUsersPanel } from "./admin-users-panel";
import { AdminTeamsPanel } from "./admin-teams-panel";
import { AdminTemplatesPanel } from "./admin-templates-panel";
import { AdminSeasonPanel } from "./admin-season-panel";
import { AdminChecklistsPanel } from "./admin-checklists-panel";
import { NotificationPrefsPanel } from "./notification-prefs-panel";

export const metadata = {
  title: "Settings",
};

type SearchParams = Promise<{ tab?: string; ga4?: string }>;

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
  const params = await searchParams;
  if (params.tab === "sync" || params.tab === "analytics") {
    redirect(`/connections${params.ga4 ? `?ga4=${encodeURIComponent(params.ga4)}` : ""}`);
  }
  const selectedTab = params.tab ?? "profile";

  // Fetch admin data in parallel if the viewer has access.
  const [rawStaffList, rawTeams, tiers, rawTemplates, seasonModes] =
    adminAccess
      ? await Promise.all([
          ["users", "teams", "templates"].includes(selectedTab) ? listUsers({ limit: 1000, site: adminScope ?? undefined }) : Promise.resolve({ users: [], totalCount: 0 }),
          selectedTab === "teams" ? listTeams() : Promise.resolve([]),
          ["templates", "checklists"].includes(selectedTab) ? listTiers() : Promise.resolve([]),
          selectedTab === "templates" ? listTemplates() : Promise.resolve([]),
          ["templates", "season"].includes(selectedTab) ? listSeasonModes() : Promise.resolve([]),
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

  const checklistItems = globalAdminAccess && selectedTab === "checklists" ? await listChecklistItems() : [];

  const validTabs = ["profile", "notifications"];
  if (adminAccess) {
    validTabs.push("users", "teams", "templates");
  }
  if (globalAdminAccess) {
    validTabs.push("season", "checklists");
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

      {adminAccess && <Link href="/connections" className="inline-block text-sm text-cyan underline underline-offset-4">Manage connections and data recovery</Link>}
      <SettingsTabs value={defaultTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-x-6 gap-y-1">
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
              <TabsTrigger value="checklists">Checklists</TabsTrigger>
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
            <TabsContent value="checklists">
              <AdminChecklistsPanel
                initialItems={checklistItems}
                tiers={tiers}
              />
            </TabsContent>
          </>
        ) : null}
      </SettingsTabs>
    </div>
  );
}
