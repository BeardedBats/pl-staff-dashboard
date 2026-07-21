import "server-only";

import { hasRoleForSite } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { AnalyticsFilters } from "@/lib/analytics/queries";

/** Bind analytics filters to the concrete sites covered by EIC/Ops grants. */
export function authorizeAnalyticsFilters(
  viewer: CurrentUser,
  filters: AnalyticsFilters,
): AnalyticsFilters | null {
  const canViewPl = hasRoleForSite(viewer, "pl", "eic", "operations");
  const canViewQb = hasRoleForSite(viewer, "qb", "eic", "operations");
  if (!canViewPl && !canViewQb) return null;

  const requestedSite = filters.site;
  if (requestedSite === "pl" && !canViewPl) return null;
  if (requestedSite === "qb" && !canViewQb) return null;

  if (requestedSite === "pl" || requestedSite === "qb") {
    return filters;
  }
  if (canViewPl && canViewQb) {
    // Undefined means both concrete sites to the analytics query layer.
    return { ...filters, site: undefined };
  }
  return { ...filters, site: canViewPl ? "pl" : "qb" };
}
