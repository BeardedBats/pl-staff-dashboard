export type TitleSyncDecision =
  | { status: "synced"; nextBaseline: string }
  | { status: "conflict"; nextBaseline: string };

export function decideTitleSync(input: {
  dashboardTitle: string;
  lastSyncedTitle: string | null;
  wordPressTitle: string;
}): TitleSyncDecision {
  const { dashboardTitle, lastSyncedTitle, wordPressTitle } = input;
  if (!lastSyncedTitle) return { status: "synced", nextBaseline: wordPressTitle };

  const dashboardChanged = dashboardTitle !== lastSyncedTitle;
  const wordPressChanged = wordPressTitle !== lastSyncedTitle;
  if (dashboardChanged && wordPressChanged && dashboardTitle !== wordPressTitle) {
    return { status: "conflict", nextBaseline: lastSyncedTitle };
  }
  return { status: "synced", nextBaseline: wordPressTitle };
}
