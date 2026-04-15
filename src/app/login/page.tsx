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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2">
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
