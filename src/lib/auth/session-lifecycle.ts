export type SessionCredential = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

export type NextSessionTokens<TPair> = {
  pair: TPair;
  accessTokenHash: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
};

export interface SessionRepository {
  find(input: {
    sessionId: string;
    userId: string;
  }): Promise<SessionCredential | null>;

  rotateIfCurrent(input: {
    sessionId: string;
    userId: string;
    expectedRefreshTokenHash: string;
    nextAccessTokenHash: string;
    nextRefreshTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<boolean>;

  revoke(sessionId: string, userId: string): Promise<void>;

  isAccessCredentialCurrent(input: {
    sessionId: string;
    userId: string;
    accessTokenHash: string;
    now: Date;
  }): Promise<boolean>;
}

export type RefreshRotationResult<TPair> =
  | { status: "rotated"; pair: TPair }
  | { status: "invalid" | "expired" | "replayed" };

/**
 * Rotate one refresh credential with compare-and-swap semantics.
 *
 * The initial read gives a useful expired/invalid distinction. Security comes
 * from `rotateIfCurrent`: only the request whose expected hash is still stored
 * can win. A losing concurrent request is treated as token-family replay and
 * revokes the session, so a token observed twice cannot leave a live family.
 */
export async function rotateRefreshSession<TPair>(input: {
  repository: SessionRepository;
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  now: Date;
  issueNext: () => NextSessionTokens<TPair>;
}): Promise<RefreshRotationResult<TPair>> {
  const current = await input.repository.find({
    sessionId: input.sessionId,
    userId: input.userId,
  });

  if (!current) return { status: "invalid" };

  if (current.refreshTokenHash !== input.refreshTokenHash) {
    await input.repository.revoke(input.sessionId, input.userId);
    return { status: "replayed" };
  }

  if (current.expiresAt.getTime() <= input.now.getTime()) {
    await input.repository.revoke(input.sessionId, input.userId);
    return { status: "expired" };
  }

  const next = input.issueNext();
  const rotated = await input.repository.rotateIfCurrent({
    sessionId: input.sessionId,
    userId: input.userId,
    expectedRefreshTokenHash: input.refreshTokenHash,
    nextAccessTokenHash: next.accessTokenHash,
    nextRefreshTokenHash: next.refreshTokenHash,
    nextExpiresAt: next.refreshExpiresAt,
    now: input.now,
  });

  if (!rotated) {
    await input.repository.revoke(input.sessionId, input.userId);
    return { status: "replayed" };
  }

  return { status: "rotated", pair: next.pair };
}

export function isCurrentAccessSession(
  repository: SessionRepository,
  input: {
    sessionId: string;
    userId: string;
    accessTokenHash: string;
    now: Date;
  },
): Promise<boolean> {
  return repository.isAccessCredentialCurrent(input);
}
