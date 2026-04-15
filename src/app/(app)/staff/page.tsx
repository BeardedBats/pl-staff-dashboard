import { Users } from "lucide-react";
import { listUsers, type ListUsersFilters } from "@/lib/users/queries";
import { listTeams } from "@/lib/teams/data";
import { StaffCard } from "@/components/users/staff-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffFilters } from "./staff-filters";
import type { AppRole, AppSite } from "@/lib/auth/current-user";

export const metadata = {
  title: "Staff Directory",
};

type SearchParams = Promise<{
  search?: string;
  role?: string;
  site?: string;
  team?: string;
}>;

const VALID_ROLES: AppRole[] = [
  "writer",
  "editor",
  "graphics",
  "manager",
  "admin",
  "eic",
  "operations",
];

const VALID_SITES: AppSite[] = ["pl", "qb", "both"];

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const filters: ListUsersFilters = { limit: 200 };
  if (params.search) filters.search = params.search;
  if (params.role && VALID_ROLES.includes(params.role as AppRole)) {
    filters.role = params.role as AppRole;
  }
  if (params.site && VALID_SITES.includes(params.site as AppSite)) {
    filters.site = params.site as AppSite;
  }
  if (params.team) filters.teamId = params.team;

  const [{ users, totalCount }, teams] = await Promise.all([
    listUsers(filters),
    listTeams(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Staff Directory
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {totalCount} {totalCount === 1 ? "staff member" : "staff members"} across
          Pitcher List and QB List.
        </p>
      </div>

      <StaffFilters
        initialSearch={params.search ?? ""}
        initialRole={params.role ?? ""}
        initialSite={params.site ?? ""}
        initialTeam={params.team ?? ""}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      />

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No staff found"
          description="Try clearing filters, or sign in a new staff member to add them to the directory."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {users.map((u) => (
            <StaffCard key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}
