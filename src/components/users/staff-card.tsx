import Link from "next/link";
import { UserAvatar } from "./user-avatar";
import { RoleBadgeGroup } from "./role-badge";
import { Badge } from "@/components/ui/badge";
import type { StaffUserSummary } from "@/lib/users/queries";

export function StaffCard({ user }: { user: StaffUserSummary }) {
  return (
    <Link
      href={`/staff/${user.id}`}
      className="group relative block rounded-lg border border-border bg-card p-4 transition-colors hover:border-navy-5 hover:bg-navy-3"
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          displayName={user.display_name}
          avatarUrl={user.avatar_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {user.display_name}
            </h3>
            <Badge variant="outline" className="shrink-0">
              {user.wp_site === "both" ? "PL + QB" : user.wp_site.toUpperCase()}
            </Badge>
          </div>
          {user.primary_team ? (
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {user.primary_team.team_name}
              {user.primary_team.manager_name ? (
                <>
                  {" "}·{" "}
                  <span className="text-text-secondary">
                    {user.primary_team.manager_name}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs italic text-text-muted">No team</p>
          )}
          {user.bio ? (
            <p className="mt-2 line-clamp-2 text-xs text-text-secondary">
              {user.bio}
            </p>
          ) : null}
          <div className="mt-3">
            <RoleBadgeGroup roles={user.roles} />
          </div>
        </div>
      </div>
    </Link>
  );
}
