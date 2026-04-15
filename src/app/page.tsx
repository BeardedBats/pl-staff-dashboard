import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Root page. Bounces to /login or /home based on auth state.
 * There's no "real" root landing — the authenticated app lives under
 * /home and the unauthenticated app lives under /login.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/home" : "/login");
}
