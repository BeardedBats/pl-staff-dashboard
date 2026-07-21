import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  SessionCredential,
  SessionRepository,
} from "@/lib/auth/session-lifecycle";

export const sessionRepository: SessionRepository = {
  async find(input): Promise<SessionCredential | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("sessions")
      .select("id, user_id, refresh_token_hash, expires_at")
      .eq("id", input.sessionId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (error) throw new Error(`Session lookup failed: ${error.message}`);
    if (!data) return null;

    return {
      id: data.id as string,
      userId: data.user_id as string,
      refreshTokenHash: data.refresh_token_hash as string,
      expiresAt: new Date(data.expires_at as string),
    };
  },

  async rotateIfCurrent(input): Promise<boolean> {
    const { data, error } = await getSupabaseAdmin()
      .from("sessions")
      .update({
        token_hash: input.nextAccessTokenHash,
        refresh_token_hash: input.nextRefreshTokenHash,
        expires_at: input.nextExpiresAt.toISOString(),
      })
      .eq("id", input.sessionId)
      .eq("user_id", input.userId)
      .eq("refresh_token_hash", input.expectedRefreshTokenHash)
      .gt("expires_at", input.now.toISOString())
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`Session rotation failed: ${error.message}`);
    return Boolean(data);
  },

  async revoke(sessionId, userId): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (error) throw new Error(`Session revocation failed: ${error.message}`);
  },

  async isAccessCredentialCurrent(input): Promise<boolean> {
    const { data, error } = await getSupabaseAdmin()
      .from("sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("user_id", input.userId)
      .eq("token_hash", input.accessTokenHash)
      .gt("expires_at", input.now.toISOString())
      .maybeSingle();

    if (error) throw new Error(`Session validation failed: ${error.message}`);
    return Boolean(data);
  },
};
