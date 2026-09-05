/** WordPress owns publication state and its exact schedule. */
export function reconcilePublication(
  current: string,
  status: string,
  date: string | null,
) {
  const validDate = date && Number.isFinite(Date.parse(date)) ? date : null;
  const editorStatus = status === "publish" ? "published"
    : status === "future" ? "scheduled"
    : ["published", "scheduled"].includes(current) ? "edited" : current;
  return {
    editorStatus,
    publication: status === "publish" || status === "future"
      ? { publish_date: validDate, publish_date_precision: validDate ? "exact" as const : "none" as const,
          published_at: status === "publish" ? validDate : null }
      : ["published", "scheduled"].includes(current)
        ? { publish_date: null, publish_date_precision: "none" as const, published_at: null }
        : {},
  };
}
