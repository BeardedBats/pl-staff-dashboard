import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/lib/auth/current-user";

const ROLE_VARIANT: Record<
  AppRole,
  "cyan" | "amber" | "purple" | "success" | "danger" | "default" | "outline"
> = {
  writer: "default",
  editor: "cyan",
  graphics: "purple",
  manager: "amber",
  admin: "danger",
  eic: "danger",
  operations: "success",
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
