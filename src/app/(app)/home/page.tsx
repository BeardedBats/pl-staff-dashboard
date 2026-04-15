import Link from "next/link";
import { getCurrentUser, isManagerPlus } from "@/lib/auth/current-user";
import { listPendingClaims } from "@/lib/claims/data";
import { listPendingArchiveRequests } from "@/lib/archive-requests/data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManagerInbox } from "./manager-inbox";

export const metadata = {
  title: "Home",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const showInbox = isManagerPlus(user);
  const [pendingClaims, pendingArchives] = showInbox
    ? await Promise.all([
        listPendingClaims(user),
        listPendingArchiveRequests(user),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Welcome, {user.display_name.split(" ")[0]}.
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          You&apos;re signed in as{" "}
          <span className="font-mono text-text-primary">{user.email}</span>
          {user.roles.length > 0 ? (
            <>
              {" "}
              · Roles:{" "}
              <span className="font-mono uppercase tracking-wider text-cyan">
                {user.roles.join(" · ")}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {showInbox ? (
        <ManagerInbox
          initialClaims={pendingClaims}
          initialArchives={pendingArchives}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Content pipeline</CardTitle>
            <CardDescription>
              The main workspace. Jump to the Content Table.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <Link
              href="/content"
              className="text-cyan underline underline-offset-2"
            >
              Open the Content Table →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff directory</CardTitle>
            <CardDescription>
              Who&apos;s on the team and what they&apos;re working on.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <Link
              href="/staff"
              className="text-cyan underline underline-offset-2"
            >
              Browse the directory →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>
              Bio, socials, Discord ID, timezone.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <Link
              href="/settings"
              className="text-cyan underline underline-offset-2"
            >
              Open settings →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
