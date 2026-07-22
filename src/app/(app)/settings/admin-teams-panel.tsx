"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, Users2, Star, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/users/user-avatar";
import type { TeamSummary, TeamDetail, TeamMemberRow } from "@/lib/teams/data";
import type { StaffUserSummary } from "@/lib/users/queries";
import type { AppSite } from "@/lib/auth/current-user";

type AdminTeamsPanelProps = {
  initialTeams: TeamSummary[];
  allUsers: StaffUserSummary[];
  allowedSites: Array<"pl" | "qb">;
};

export function AdminTeamsPanel({
  initialTeams,
  allUsers,
  allowedSites,
}: AdminTeamsPanelProps) {
  const router = useRouter();
  const [teams, setTeams] = React.useState(initialTeams);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(
    initialTeams[0]?.id ?? null,
  );
  const [teamDetail, setTeamDetail] = React.useState<TeamDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    setTeams(initialTeams);
  }, [initialTeams]);

  // Load the detail for the selected team.
  React.useEffect(() => {
    if (!selectedTeamId) {
      setTeamDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    fetch(`/api/teams/${selectedTeamId}`)
      .then((r) => r.json())
      .then((data: { team?: TeamDetail }) => {
        if (!cancelled && data.team) setTeamDetail(data.team);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  async function refresh() {
    const res = await fetch("/api/teams");
    const data = (await res.json()) as { teams: TeamSummary[] };
    setTeams(
      (data.teams ?? []).filter((team) =>
        team.site === "both"
          ? allowedSites.length === 2
          : allowedSites.includes(team.site),
      ),
    );
    if (selectedTeamId) {
      const detailRes = await fetch(`/api/teams/${selectedTeamId}`);
      const detailData = (await detailRes.json()) as { team?: TeamDetail };
      setTeamDetail(detailData.team ?? null);
    }
    router.refresh();
  }

  async function deleteTeamRow(id: string) {
    const confirmed = window.confirm("Delete this team? Members will be unassigned.");
    if (!confirmed) return;
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedTeamId === id) setSelectedTeamId(null);
      await refresh();
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      {/* Left — team list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Teams</CardTitle>
            <CardDescription className="text-xs">
              {teams.length} {teams.length === 1 ? "team" : "teams"}
            </CardDescription>
          </div>
          <CreateTeamDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            allUsers={allUsers}
            allowedSites={allowedSites}
            onCreated={(id) => {
              setCreateOpen(false);
              setSelectedTeamId(id);
              void refresh();
            }}
          />
        </CardHeader>
        <CardContent className="p-3">
          {teams.length === 0 ? (
            <EmptyState
              title="No teams yet"
              description="Create a team to group writers under a manager."
            />
          ) : (
            <ul className="space-y-1">
              {teams.map((team) => {
                const active = selectedTeamId === team.id;
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`w-full rounded-sm border border-transparent px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-cyan/30 bg-cyan-dim"
                          : "hover:bg-surface-3"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-sm font-medium ${active ? "text-cyan" : "text-text-cell"}`}
                        >
                          {team.name}
                        </p>
                        <Badge variant="outline" className="shrink-0 font-data">
                          {team.site === "both" ? "PL+QB" : team.site.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-zero">
                        {team.manager_name} · {team.member_count}{" "}
                        {team.member_count === 1 ? "member" : "members"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Right — detail */}
      <div>
        {loadingDetail && !teamDetail ? (
          <EmptyState title="Loading team…" />
        ) : !teamDetail ? (
          <EmptyState
            icon={<Users2 className="h-5 w-5" />}
            title="Select a team"
            description="Pick a team from the left to view members and manage assignments."
          />
        ) : (
          <TeamDetailPanel
            team={teamDetail}
            allUsers={allUsers}
            onChanged={refresh}
            onDelete={() => deleteTeamRow(teamDetail.id)}
          />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Team detail panel
// --------------------------------------------------------------------------

function TeamDetailPanel({
  team,
  allUsers,
  onChanged,
  onDelete,
}: {
  team: TeamDetail;
  allUsers: StaffUserSummary[];
  onChanged: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [addUserId, setAddUserId] = React.useState<string>("");
  const [addAsPrimary, setAddAsPrimary] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const memberIds = new Set(team.members.map((m) => m.user_id));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.id));

  async function addMember() {
    if (!addUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: addUserId, is_primary: addAsPrimary }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Add failed");
        setBusy(false);
        return;
      }
      setAddUserId("");
      setAddAsPrimary(false);
      await onChanged();
    } catch {
      setError("Network error");
    }
    setBusy(false);
  }

  async function removeMember(member: TeamMemberRow) {
    const confirmed = window.confirm(`Remove ${member.display_name} from ${team.name}?`);
    if (!confirmed) return;
    const res = await fetch(
      `/api/teams/${team.id}/members/${member.user_id}`,
      { method: "DELETE" },
    );
    if (res.ok) await onChanged();
  }

  async function setPrimary(member: TeamMemberRow) {
    const res = await fetch(
      `/api/teams/${team.id}/members/${member.user_id}`,
      { method: "PATCH" },
    );
    if (res.ok) await onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{team.name}</CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-data">
              {team.site === "both" ? "PL + QB" : team.site.toUpperCase()}
            </Badge>
            <span>
              Managed by <span className="text-text-team">{team.manager_name}</span>
            </span>
            <span>
              · {team.member_count} {team.member_count === 1 ? "member" : "members"}
            </span>
          </CardDescription>
          {team.description ? (
            <p className="mt-2 text-sm text-text-team">{team.description}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete team"
          title="Delete team"
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Members */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-zero">
            Members
          </h4>
          {team.members.length === 0 ? (
            <p className="text-text-zero">No members yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {team.members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      displayName={m.display_name}
                      avatarUrl={m.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-cell">
                        {m.display_name}
                      </p>
                      <p className="truncate font-data text-[10px] text-text-zero">
                        {m.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.is_primary ? (
                      <Badge variant="cyan">Primary</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPrimary(m)}
                        title="Mark as primary team"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMember(m)}
                      aria-label={`Remove ${m.display_name}`}
                      title="Remove from team"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add member */}
        <div className="rounded-md border border-dashed border-border bg-surface-3/30 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-zero">
            Add member
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={addUserId} onValueChange={setAddUserId}>
              <SelectTrigger className="min-w-[240px] flex-1">
                <SelectValue placeholder="Choose a staff member…" />
              </SelectTrigger>
              <SelectContent>
                {nonMembers.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-text-zero">
                    All staff are already on this team.
                  </div>
                ) : (
                  nonMembers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-text-team">
              <Checkbox
                checked={addAsPrimary}
                onCheckedChange={(checked) => setAddAsPrimary(Boolean(checked))}
              />
              Mark as primary
            </label>
            <Button onClick={addMember} disabled={!addUserId || busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Create team dialog
// --------------------------------------------------------------------------

function CreateTeamDialog({
  open,
  onOpenChange,
  allUsers,
  allowedSites,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allUsers: StaffUserSummary[];
  allowedSites: Array<"pl" | "qb">;
  onCreated: (newId: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [site, setSite] = React.useState<AppSite>(allowedSites[0] ?? "pl");
  const [managerId, setManagerId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Eligible managers: anyone with editor / manager / admin / eic / operations.
  const eligibleManagers = allUsers.filter((user) => {
    const hasEligibleRole = (candidateSite: "pl" | "qb") =>
      user.role_rows.some(
        (row) =>
          ["editor", "manager", "admin", "eic", "operations"].includes(
            row.role,
          ) &&
          (row.site === "both" || row.site === candidateSite),
      );
    return site === "both"
      ? hasEligibleRole("pl") && hasEligibleRole("qb")
      : hasEligibleRole(site);
  });

  function reset() {
    setName("");
    setDescription("");
    setSite(allowedSites[0] ?? "pl");
    setManagerId("");
    setError(null);
  }

  async function handleCreate() {
    if (!name.trim() || !managerId) {
      setError("Name and manager are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          site,
          manager_id: managerId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        team_id?: string;
        error?: string;
      };
      if (!res.ok || !data.team_id) {
        setError(data.error ?? "Create failed");
        setSaving(false);
        return;
      }
      reset();
      onCreated(data.team_id);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          New team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Teams are content verticals with a single manager. Writers can belong
            to multiple teams but have one primary team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SP Roundup, Hitter List, Prospects…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-description">Description (optional)</Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this team is responsible for."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={site} onValueChange={(v) => setSite(v as AppSite)}>
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
            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a manager…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleManagers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-text-zero">
                      No eligible managers found (need editor / manager / admin role).
                    </div>
                  ) : (
                    eligibleManagers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Create team
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
