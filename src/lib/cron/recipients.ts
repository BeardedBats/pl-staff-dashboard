export type SiteScopedRecipient = {
  user_id: string;
  site: "pl" | "qb" | "both";
};

export function recipientsForSite(
  rows: SiteScopedRecipient[],
  site: "pl" | "qb",
): string[] {
  return Array.from(
    new Set(
      rows
        .filter((row) => row.site === "both" || row.site === site)
        .map((row) => row.user_id),
    ),
  );
}
