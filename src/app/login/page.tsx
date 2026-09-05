import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  // Already authenticated? Bounce to home.
  const user = await getCurrentUser();
  if (user) {
    redirect("/my-tasks");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Mesh gradient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-cyan/[0.04] blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] rounded-full bg-amber/[0.03] blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/[0.03] blur-[80px]" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="plpd-panel-frame mb-2 inline-flex items-center justify-center rounded-lg border border-border bg-card/80 px-5 py-2.5">
            <span className="font-data text-lg font-bold uppercase tracking-wider text-cyan">
              Pitcher List
            </span>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-cell">
            Staff Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-zero">
            Sign in with your Pitcher List WordPress credentials.
          </p>
        </div>

        <LoginForm />
        <details className="mt-5 rounded-lg border border-border bg-card p-4 text-sm text-text-team">
          <summary className="cursor-pointer font-medium text-text-cell">First time signing in?</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Open <a href="https://pitcherlist.com/wp-admin/profile.php#application-passwords-section" target="_blank" rel="noreferrer" className="text-cyan underline">your WordPress profile</a>.</li>
            <li>Create an application password named “Staff Dashboard”.</li>
            <li>Use your WordPress username and that application password here.</li>
          </ol>
          <p className="mt-3 text-xs">Keep the password private. Your regular WordPress password will not work here.</p>
        </details>

        <p className="mt-6 text-center text-xs text-text-zero">
          Trouble signing in? Reach out to a dashboard admin for help creating
          your WordPress application password.
        </p>
      </div>
    </div>
  );
}
