import Link from "next/link";
import { UserAvatar } from "./user-avatar";
import { RoleBadgeGroup } from "./role-badge";
import { Badge } from "@/components/ui/badge";
import type { StaffUserSummary } from "@/lib/users/queries";

export function StaffCard({ user }: { user: StaffUserSummary }) {
  return (
    <Link
      href={`/staff/${user.id}`}
      className="group relative block rounded-lg border border-border bg-card p-4 transition-colors hover:border-surface-5 hover:bg-surface-3"
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          displayName={user.display_name}
          avatarUrl={user.avatar_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="break-words text-sm font-semibold text-text-cell">
              {user.display_name}
            </h3>
            <Badge variant="outline" className="shrink-0 font-data">
              {user.wp_site === "both" ? "PL + QB" : user.wp_site.toUpperCase()}
            </Badge>
          </div>
          {user.primary_team ? (
            <p className="mt-0.5 break-words font-data text-xs text-text-zero">
              {user.primary_team.team_name}
              {user.primary_team.manager_name ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-text-team">
                    {user.primary_team.manager_name}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-zero">No team</p>
          )}
          {user.bio ? (
            <p className="mt-2 break-words text-xs text-text-team">
              {user.bio}
            </p>
          ) : null}
          <div className="mt-3">
            <RoleBadgeGroup roles={user.roles} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={user.availability_status === "available" ? "cyan" : user.availability_status === "limited" ? "amber" : "outline"}
            >
              {user.availability_status === "available"
                ? "Available"
                : user.availability_status === "limited"
                  ? "Limited capacity"
                  : "Unavailable"}
            </Badge>
            {user.availability_note ? (
              <span className="text-xs text-text-team">{user.availability_note}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
