import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

/**
 * Authenticated layout.
 *
 * Any route under `src/app/(app)/` inherits this layout and the auth gate.
 * The route group parentheses are stripped from the URL, so `/(app)/home`
 * is served at `/home`.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar userRoles={user.roles} userDisplayName={user.display_name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userId={user.id}
          displayName={user.display_name}
          email={user.email}
          avatarUrl={user.avatar_url}
          roles={user.roles}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
