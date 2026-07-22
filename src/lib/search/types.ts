import type { AppSite } from "@/lib/auth/current-user";

export type DashboardSearchKind =
  | "entry"
  | "staff"
  | "assignment"
  | "graphic"
  | "schedule";

export type DashboardSearchResult = {
  id: string;
  kind: DashboardSearchKind;
  title: string;
  context: string;
  href: string;
  site: AppSite | null;
};

export type DashboardSearchResponse = {
  query: string;
  results: DashboardSearchResult[];
  partial: boolean;
  unavailableKinds: DashboardSearchKind[];
};
