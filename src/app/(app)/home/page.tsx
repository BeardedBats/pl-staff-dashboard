import { getCurrentUser } from "@/lib/auth/current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Home",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  // The layout guard already redirected non-users. This is a safety net.
  if (!user) return null;

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
              {" "}· Roles:{" "}
              <span className="font-mono uppercase tracking-wider text-cyan">
                {user.roles.join(" · ")}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Step 1 complete</CardTitle>
            <CardDescription>
              Scaffold, auth, and shell are wired up.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            Next up: user sync from WordPress, staff directory, and team
            management (Step 2).
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>From WordPress + dashboard DB.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-text-secondary">
            <div>
              <span className="text-text-muted">Display name:</span>{" "}
              {user.display_name}
            </div>
            <div>
              <span className="text-text-muted">WP user ID:</span>{" "}
              {user.wp_user_id}
            </div>
            <div>
              <span className="text-text-muted">Site:</span> {user.wp_site.toUpperCase()}
            </div>
            <div>
              <span className="text-text-muted">Timezone:</span> {user.timezone}
            </div>
            <div>
              <span className="text-text-muted">Theme:</span> {user.theme}
            </div>
            <div>
              <span className="text-text-muted">Publish:</span>{" "}
              {user.can_publish ? "yes" : "no"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theme system</CardTitle>
            <CardDescription>Click the moon/sun in the header.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            Dashboard defaults to dark. Toggle to confirm both palettes render
            cleanly with Tailwind v4 class-based dark mode.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
