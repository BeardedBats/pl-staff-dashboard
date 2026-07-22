/** Keep application identity lookups aligned with the database email rules. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
