import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/lib/auth/current-user";

// Roles are DECORATIVE identity, not status (addendum Q2). They never use the
// reserved semantic colors (green/red/val-pos) — those are for status only.
// manager vs eic are separated by fill-vs-outline amber, not a new hue.
type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const ROLE_VARIANT: Record<AppRole, BadgeVariant> = {
  writer: "zero", // gray/zero identity
  editor: "cyan",
  graphics: "violet",
  manager: "amber", // filled amber
  admin: "cyanHeader", // brighter chrome accent — seniority without alarm
  eic: "amberOutline", // amber emphasis, outline to distinguish from manager
  operations: "blue",
};

const ROLE_LABEL: Record<AppRole, string> = {
  writer: "Writer",
  editor: "Editor",
  graphics: "Graphics",
  manager: "Manager",
  admin: "Admin",
  eic: "EIC",
  operations: "Ops",
};

export function RoleBadge({ role }: { role: AppRole }) {
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>;
}

export function RoleBadgeGroup({ roles }: { roles: readonly AppRole[] }) {
  if (roles.length === 0) {
    return <Badge variant="outline">No role</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <RoleBadge key={r} role={r} />
      ))}
    </div>
  );
}
