import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, AtSign, Hash } from "lucide-react";
import {
  getCurrentUser,
  isAdminPlus,
} from "@/lib/auth/current-user";
import { getUserById } from "@/lib/users/queries";
import { UserAvatar } from "@/components/users/user-avatar";
import { RoleBadgeGroup } from "@/components/users/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type RouteParams = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}) {
  const { id } = await params;
  const user = await getUserById(id);
  return { title: user?.display_name ?? "Staff member" };
}

export default async function StaffMemberPage({
  params,
}: {
  params: RouteParams;
}) {
  const { id } = await params;
  const [viewer, target] = await Promise.all([
    getCurrentUser(),
    getUserById(id),
  ]);
  if (!target) notFound();
  if (!viewer) return null;

  const isSelf = viewer.id === target.id;
  const isPrivileged = isSelf || isAdminPlus(viewer);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="text-text-muted">
          <Link href="/staff">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to directory
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        {/* Left column — identity card */}
        <Card>
          <CardContent className="flex flex-col items-center p-6 text-center">
            <UserAvatar
              displayName={target.display_name}
              avatarUrl={target.avatar_url}
              size="xl"
            />
            <h2 className="mt-4 text-lg font-semibold text-text-primary">
              {target.display_name}
            </h2>
            {isPrivileged && target.email ? (
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {target.email}
              </p>
            ) : null}

            <div className="mt-4 flex justify-center">
              <RoleBadgeGroup roles={target.roles} />
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-1">
              <Badge variant="outline">
                {target.wp_site === "both" ? "PL + QB" : target.wp_site.toUpperCase()}
              </Badge>
              {target.primary_team ? (
                <Badge variant="cyan">{target.primary_team.team_name}</Badge>
              ) : null}
            </div>

            {isSelf ? (
              <Button asChild variant="outline" size="sm" className="mt-6 w-full">
                <Link href="/settings">Edit profile</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column — details */}
        <div className="space-y-6">
          {target.bio ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {target.bio}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {target.twitter_handle ? (
                <DetailRow
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Twitter / X"
                  value={`@${target.twitter_handle}`}
                  href={`https://twitter.com/${target.twitter_handle}`}
                />
              ) : null}
              {target.bluesky_handle ? (
                <DetailRow
                  icon={<AtSign className="h-3.5 w-3.5" />}
                  label="Bluesky"
                  value={target.bluesky_handle}
                  href={
                    target.bluesky_handle.startsWith("http")
                      ? target.bluesky_handle
                      : `https://bsky.app/profile/${target.bluesky_handle.replace(/^@/, "")}`
                  }
                />
              ) : null}
              {isPrivileged && target.email ? (
                <DetailRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={target.email}
                  href={`mailto:${target.email}`}
                />
              ) : null}
              <DetailRow
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Timezone"
                value={target.timezone}
              />
            </CardContent>
          </Card>

          {target.teams.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Teams</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {target.teams.map((t, idx) => (
                    <li
                      key={t.team_id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          {t.team_name}
                          {t.is_primary ? (
                            <Badge variant="cyan">Primary</Badge>
                          ) : null}
                        </p>
                        {t.manager_name ? (
                          <p className="mt-0.5 text-xs text-text-muted">
                            Managed by{" "}
                            <span className="text-text-secondary">
                              {t.manager_name}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{t.team_site.toUpperCase()}</Badge>
                      {idx < 0 ? <Separator /> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <span className="truncate text-text-secondary">{value}</span>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-sm transition-colors hover:text-cyan"
      >
        {content}
      </a>
    );
  }
  return content;
}
