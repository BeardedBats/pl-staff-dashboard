"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/users/user-avatar";
import type { StaffUserSummary } from "@/lib/users/queries";
import type { AvailabilityStatus } from "@/lib/users/queries";

// Curated short timezone list. Most PL staff are US-based; international
// contributors can extend as needed.
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

type ProfileFormProps = {
  profile: StaffUserSummary;
};

type FormState = {
  display_name: string;
  bio: string;
  twitter_handle: string;
  bluesky_handle: string;
  timezone: string;
  auto_approve_drafts: boolean;
  availability_status: AvailabilityStatus;
  availability_note: string;
  availability_until: string;
};

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>({
    display_name: profile.display_name,
    bio: profile.bio ?? "",
    twitter_handle: profile.twitter_handle ?? "",
    bluesky_handle: profile.bluesky_handle ?? "",
    timezone: profile.timezone,
    auto_approve_drafts: profile.auto_approve_drafts,
    availability_status: profile.availability_status,
    availability_note: profile.availability_note ?? "",
    availability_until: profile.availability_until ?? "",
  });
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status === "saved") setStatus("idle");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    const payload = {
      display_name: form.display_name.trim(),
      bio: form.bio.trim() || null,
      twitter_handle: form.twitter_handle.trim() || null,
      bluesky_handle: form.bluesky_handle.trim() || null,
      timezone: form.timezone,
      auto_approve_drafts: form.auto_approve_drafts,
      availability_status: form.availability_status,
      availability_note: form.availability_note.trim() || null,
      availability_until: form.availability_until || null,
    };

    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Save failed");
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Network error — try again");
    }
  }

  async function handleResyncFromWp() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${profile.id}/resync-wp`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Sync failed");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>
            Share your own capacity signal with teammates. This is visible in the staff directory and is not inferred from output or activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="availability-status">Current availability</Label>
            <Select
              value={form.availability_status}
              onValueChange={(value) => update("availability_status", value as AvailabilityStatus)}
            >
              <SelectTrigger id="availability-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="limited">Limited capacity</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="availability-until">Through (optional)</Label>
            <Input
              id="availability-until"
              type="date"
              value={form.availability_until}
              onChange={(event) => update("availability_until", event.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="availability-note">Short note (optional)</Label>
            <Input
              id="availability-note"
              maxLength={160}
              value={form.availability_note}
              onChange={(event) => update("availability_note", event.target.value)}
              placeholder="For example: Limited through Friday; one short edit is okay."
            />
          </div>
        </CardContent>
      </Card>
      {/* Identity card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>
              This is how other staff see you in the directory and author bylines.
              Refreshing from WordPress updates your bio and avatar without
              replacing a display name you saved here.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResyncFromWp}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh from WordPress
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar
              displayName={profile.display_name}
              avatarUrl={profile.avatar_url}
              size="xl"
            />
            <p className="text-sm text-text-zero">
              Avatar comes from your WordPress account&apos;s Gravatar. To change
              it, update your Gravatar at{" "}
              <a
                className="text-cyan underline"
                href="https://gravatar.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                gravatar.com
              </a>{" "}
              and hit &quot;Refresh from WordPress&quot; above.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => update("display_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email (read-only)</Label>
              <Input
                id="email"
                value={profile.email ?? ""}
                disabled
                className="opacity-60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={4}
              placeholder="A sentence or two about you. Syncs with your WordPress profile."
            />
          </div>
        </CardContent>
      </Card>

      {/* Socials */}
      <Card>
        <CardHeader>
          <CardTitle>Socials</CardTitle>
          <CardDescription>
            Where readers and staff can find you outside the site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="twitter_handle">Twitter / X</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-zero">
                  @
                </span>
                <Input
                  id="twitter_handle"
                  value={form.twitter_handle.replace(/^@/, "")}
                  onChange={(e) => update("twitter_handle", e.target.value)}
                  className="pl-7"
                  placeholder="yourhandle"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bluesky_handle">Bluesky</Label>
              <Input
                id="bluesky_handle"
                value={form.bluesky_handle}
                onChange={(e) => update("bluesky_handle", e.target.value)}
                placeholder="nick.bsky.social"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Timezone, workflow defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(value) => update("timezone", value)}
            >
              <SelectTrigger id="timezone" className="w-full max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface-3 p-3">
            <div>
              <p className="text-sm font-medium text-text-cell">
                Auto-approve my WordPress drafts
              </p>
              <p className="text-xs text-text-zero">
                Skip the manual approval step when a draft you started appears
                via the WP sync.
              </p>
            </div>
            <Switch
              checked={form.auto_approve_drafts}
              onCheckedChange={(checked) =>
                update("auto_approve_drafts", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save row */}
      <div className="flex items-center justify-end gap-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : status === "saved" ? (
          <p className="flex items-center gap-1.5 text-sm text-green">
            <Check className="h-3.5 w-3.5" />
            Saved
          </p>
        ) : null}
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
