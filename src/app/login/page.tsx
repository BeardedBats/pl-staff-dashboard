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
    redirect("/home");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Mesh gradient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-cyan/[0.04] blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] rounded-full bg-amber/[0.03] blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple/[0.03] blur-[80px]" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center justify-center rounded-lg border border-border bg-card/80 px-5 py-2.5 shadow-lg ring-1 ring-white/[0.05] backdrop-blur-sm">
            <span className="font-mono text-lg font-bold uppercase tracking-wider text-cyan">
              Pitcher List
            </span>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Staff Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign in with your Pitcher List WordPress credentials.
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs text-text-muted">
          Trouble signing in? Reach out to a dashboard admin for help creating
          your WordPress application password.
        </p>
      </div>
    </div>
  );
}
