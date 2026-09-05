"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const username = (formData.get("username") as string | null)?.trim() ?? "";
    const password = (formData.get("password") as string | null) ?? "";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setIsSubmitting(false);
        return;
      }

      // Hard-navigate so the fresh cookies are visible to the server layout.
      router.refresh();
      router.replace("/my-tasks");
    } catch {
      setError("Network error. Check your connection and retry.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="username">WordPress username or email</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              disabled={isSubmitting}
              placeholder="e.g. nickpollack"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Application password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            />
            <p className="text-xs text-text-zero">
              Not your regular WordPress password. Create one under
              {" "}
              <span className="font-sans text-text-team">
                Users → Profile → Application Passwords
              </span>{" "}
              in WordPress admin.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <LogIn />
                Sign in
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
