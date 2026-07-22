"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffUserSummary } from "@/lib/users/queries";
import type { AppRole, AppSite } from "@/lib/auth/current-user";

const ALL_ROLES: Array<{ role: AppRole; description: string }> = [
  { role: "writer", description: "Can claim and submit articles" },
  { role: "editor", description: "Can claim editing assignments" },
  { role: "graphics", description: "Can claim graphic requests" },
  { role: "manager", description: "Can approve claims and archive requests" },
  { role: "admin", description: "Can access all admin settings" },
  { role: "eic", description: "Can view analytics; sees EIC home dashboard" },
  { role: "operations", description: "Can view analytics and upload Raptive data" },
];

type TeamOption = { id: string; name: string; site: AppSite };

type EditUserDialogProps = {
  user: StaffUserSummary;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: StaffUserSummary) => void;
  allowedSites: Array<"pl" | "qb">;
};

export function EditUserDialog({
  user,
  open,
  onClose,
  onSaved,
  allowedSites,
}: EditUserDialogProps) {
  const initialRoleRows = user.role_rows;
  const initialPrimaryTeamId = user.primary_team?.team_id ?? null;

  const [displayName, setDisplayName] = React.useState(user.display_name);
  const [wpSite, setWpSite] = React.useState<AppSite>(user.wp_site);
  const [canPublish, setCanPublish] = React.useState(user.can_publish);
  const [selectedRoles, setSelectedRoles] = React.useState<Set<AppRole>>(
    () => new Set(user.role_rows.map((r) => r.role)),
  );
  const [primaryTeamId, setPrimaryTeamId] = React.useState<string | null>(
    initialPrimaryTeamId,
  );
  const [teams, setTeams] = React.useState<TeamOption[] | null>(null);
  const [teamsError, setTeamsError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state every time the dialog opens with a (possibly different) user.
  React.useEffect(() => {
    if (!open) return;
    setDisplayName(user.display_name);
    setWpSite(user.wp_site);
    setCanPublish(user.can_publish);
    setSelectedRoles(new Set(user.role_rows.map((r) => r.role)));
    setPrimaryTeamId(user.primary_team?.team_id ?? null);
    setError(null);
  }, [open, user]);

  // Lazy-load the full team list the first time the dialog opens.
  React.useEffect(() => {
    if (!open || teams !== null) return;
    let cancelled = false;
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data: { teams?: TeamOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.teams) {
          setTeams(data.teams);
          setTeamsError(null);
        } else {
          setTeamsError(data.error ?? "Failed to load teams");
        }
      })
      .catch(() => {
        if (!cancelled) setTeamsError("Failed to load teams");
      });
    return () => {
      cancelled = true;
    };
  }, [open, teams]);

  function toggleRole(role: AppRole) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    // Build the role payload: for each selected role, prefer the user's
    // existing site assignment (so we don't accidentally rewrite per-site
    // rows admins set up via the dedicated /roles endpoint). Newly-added
    // roles inherit the user's current wp_site.
    const rolesPayload = Array.from(selectedRoles).flatMap((role) => {
      const existing = initialRoleRows.filter((row) => row.role === role);
      return existing.length > 0 ? existing : [{ role, site: wpSite }];
    });

    const body: Record<string, unknown> = {
      display_name: displayName.trim(),
      wp_site: wpSite,
      can_publish: canPublish,
      roles: rolesPayload,
      team_id: primaryTeamId,
    };

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: StaffUserSummary;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Save failed");
        setSaving(false);
        return;
      }
      onSaved(data.user);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  const teamOptions: TeamOption[] = teams ?? [];
  // Show a single contextually-correct default the dialog can render before
  // the teams fetch resolves — keeps the select from popping empty.
  const primaryTeamLabel = (() => {
    if (primaryTeamId === null) return "No primary team";
    const match = teamOptions.find((t) => t.id === primaryTeamId);
    if (match) return match.name;
    return user.primary_team?.team_name ?? "(unknown team)";
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user · {user.display_name}</DialogTitle>
          <DialogDescription>
            Update roles, site assignment, publish permission, and primary
            team for this staff member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Read-only reference fields */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface-3/40 p-3 font-data text-[11px]">
            <div>
              <p className="text-text-zero">Email</p>
              <p className="text-text-team">
                {user.email ?? (
                  <span className="italic text-text-zero">
                    (set on first WP login)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-text-zero">WP user ID</p>
              <p className="text-text-team">{user.wp_user_id}</p>
            </div>
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-display-name">Display name</Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
            />
            <p className="text-xs text-text-zero">
              Manual edits won&apos;t be overwritten by WP sync.
            </p>
          </div>

          {/* WP site */}
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={wpSite} onValueChange={(v) => setWpSite(v as AppSite)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedSites.includes("pl") ? (
                  <SelectItem value="pl">Pitcher List</SelectItem>
                ) : null}
                {allowedSites.includes("qb") ? (
                  <SelectItem value="qb">QB List</SelectItem>
                ) : null}
                {allowedSites.length === 2 ? (
                  <SelectItem value="both">Both</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {/* Can publish */}
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-3/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-text-cell">
                Can publish
              </p>
              <p className="text-xs text-text-zero">
                Allow this user to schedule / publish entries directly.
              </p>
            </div>
            <Switch
              checked={canPublish}
              onCheckedChange={setCanPublish}
              aria-label="Toggle publish permission"
            />
          </div>

          {/* Primary team */}
          <div className="space-y-1.5">
            <Label>Primary team</Label>
            <Select
              value={primaryTeamId ?? "__none__"}
              onValueChange={(v) =>
                setPrimaryTeamId(v === "__none__" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={primaryTeamLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No primary team</SelectItem>
                {teamOptions
                  .filter((t) =>
                    t.site === "both"
                      ? allowedSites.length === 2
                      : allowedSites.includes(t.site),
                  )
                  .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{" "}
                    <span className="ml-1 text-[10px] text-text-zero">
                      ({t.site.toUpperCase()})
                    </span>
                  </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {teams === null && !teamsError ? (
              <p className="text-xs text-text-zero">Loading teams…</p>
            ) : null}
            {teamsError ? (
              <p className="text-xs text-destructive">{teamsError}</p>
            ) : null}
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="space-y-1.5">
              {ALL_ROLES.map(({ role, description }) => {
                const isActive = selectedRoles.has(role);
                return (
                  <label
                    key={role}
                    htmlFor={`edituser-role-${role}`}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-3/40 px-3 py-2 hover:bg-surface-3"
                  >
                    <Checkbox
                      id={`edituser-role-${role}`}
                      checked={isActive}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize text-text-cell">
                        {role}
                      </p>
                      <p className="text-xs text-text-zero">{description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error ? (
            <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
