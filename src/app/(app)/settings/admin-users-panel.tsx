"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { UserAvatar } from "@/components/users/user-avatar";
import { RoleBadgeGroup } from "@/components/users/role-badge";
import type { StaffUserSummary } from "@/lib/users/queries";
import { EditUserDialog } from "./edit-user-dialog";

type AdminUsersPanelProps = {
  initialUsers: StaffUserSummary[];
  totalCount: number;
  allowedSites: Array<"pl" | "qb">;
};

export function AdminUsersPanel({
  initialUsers,
  totalCount,
  allowedSites,
}: AdminUsersPanelProps) {
  const router = useRouter();
  const [users, setUsers] = React.useState(initialUsers);
  const [search, setSearch] = React.useState("");
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  // Keep local state in sync if server revalidation happens.
  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      u.display_name.toLowerCase().includes(term) ||
      (u.email?.toLowerCase().includes(term) ?? false)
    );
  });

  async function togglePublish(user: StaffUserSummary) {
    const next = !user.can_publish;
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, can_publish: next } : u)),
    );
    const res = await fetch(`/api/users/${user.id}/publish`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ can_publish: next }),
    });
    if (!res.ok) {
      // Revert on failure.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, can_publish: !next } : u,
        ),
      );
    }
  }

  const editingUser = users.find((u) => u.id === editingUserId) ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>User management</CardTitle>
          <CardDescription>
            {totalCount} staff member{totalCount === 1 ? "" : "s"} · Click a row
            to edit roles, site, primary team, and more.
          </CardDescription>
        </div>
        <ImportUserDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            setImportOpen(false);
            router.refresh();
          }}
          allowedSites={allowedSites}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search staff by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full divide-y divide-border font-data text-sm">
            <thead className="bg-surface-3 text-xs uppercase tracking-wider text-text-zero">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Roles</th>
                <th className="px-3 py-2 text-left font-medium">Site</th>
                <th className="px-3 py-2 text-left font-medium">Primary team</th>
                <th className="px-3 py-2 text-center font-medium">Publish</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className="cursor-pointer hover:bg-surface-3/50"
                  onClick={() => setEditingUserId(user.id)}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        displayName={user.display_name}
                        avatarUrl={user.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-cell">
                          {user.display_name}
                        </p>
                        <p className="truncate font-data text-[10px] text-text-zero">
                          {user.email ?? (
                            <span className="italic">pending first login</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <RoleBadgeGroup roles={user.roles} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="font-data">
                      {user.wp_site === "both"
                        ? "PL+QB"
                        : user.wp_site.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-text-team">
                    {user.primary_team?.team_name ?? (
                      <span className="italic text-text-zero">none</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={user.can_publish}
                      onCheckedChange={() => togglePublish(user)}
                      aria-label={`Toggle publish permission for ${user.display_name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingUserId(user.id);
                      }}
                    >
                      Edit user
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm italic text-text-zero"
                  >
                    No users match your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>

      {editingUser ? (
        <EditUserDialog
          user={editingUser}
          open={Boolean(editingUserId)}
          onClose={() => setEditingUserId(null)}
          onSaved={(updated) => {
            setUsers((prev) =>
              prev.map((u) => (u.id === updated.id ? updated : u)),
            );
            setEditingUserId(null);
            router.refresh();
          }}
          allowedSites={allowedSites}
        />
      ) : null}
    </Card>
  );
}

// --------------------------------------------------------------------------
// Manual WP import dialog
// --------------------------------------------------------------------------

function ImportUserDialog({
  open,
  onOpenChange,
  onImported,
  allowedSites,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  allowedSites: Array<"pl" | "qb">;
}) {
  const [site, setSite] = React.useState<"pl" | "qb">(
    allowedSites[0] ?? "pl",
  );
  const [identifier, setIdentifier] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  function reset() {
    setSite(allowedSites[0] ?? "pl");
    setIdentifier("");
    setError(null);
    setSuccess(null);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setSuccess(null);

    const isNumeric = /^\d+$/.test(identifier.trim());
    const payload: Record<string, unknown> = { site };
    if (isNumeric) {
      payload.wp_user_id = Number(identifier.trim());
    } else {
      payload.username = identifier.trim();
    }

    try {
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { display_name: string };
        created?: boolean;
      };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Import failed");
        setImporting(false);
        return;
      }
      setSuccess(
        data.created
          ? `Imported ${data.user.display_name}`
          : `Updated ${data.user.display_name}`,
      );
      setImporting(false);
      setTimeout(() => {
        reset();
        onImported();
      }, 800);
    } catch {
      setError("Network error");
      setImporting(false);
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
          <UserPlus className="h-3.5 w-3.5" />
          Import WP user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a WordPress user</DialogTitle>
          <DialogDescription>
            Pull a staff member into the dashboard without waiting for them to
            log in. Provide their WordPress username (slug) or numeric user ID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={site} onValueChange={(v) => setSite(v as "pl" | "qb")}>
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
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="identifier">Username or WP user ID</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. nickpollack or 42"
            />
            <p className="text-xs text-text-zero">
              If it&apos;s all numbers, it&apos;ll be treated as a WP user ID.
              Otherwise it&apos;ll be looked up by username slug.
            </p>
          </div>

          {error ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <X className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="flex items-center gap-1.5 text-sm text-green">
              <Check className="h-3.5 w-3.5" />
              {success}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || !identifier.trim()}
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
