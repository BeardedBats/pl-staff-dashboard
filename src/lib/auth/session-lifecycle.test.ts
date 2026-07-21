import { describe, expect, it } from "vitest";
import {
  isCurrentAccessSession,
  rotateRefreshSession,
  type SessionCredential,
  type SessionRepository,
} from "./session-lifecycle";

type Stored = {
  id: string;
  userId: string;
  accessHash: string;
  refreshHash: string;
  expiresAt: Date;
};

function makeRepository(initial: Stored | null, readBarrier?: () => Promise<void>) {
  let stored = initial;
  let revocations = 0;

  const repository: SessionRepository = {
    async find(input): Promise<SessionCredential | null> {
      if (readBarrier) await readBarrier();
      if (
        !stored ||
        stored.id !== input.sessionId ||
        stored.userId !== input.userId
      ) {
        return null;
      }
      return {
        id: stored.id,
        userId: stored.userId,
        refreshTokenHash: stored.refreshHash,
        expiresAt: stored.expiresAt,
      };
    },

    async rotateIfCurrent(input): Promise<boolean> {
      if (
        !stored ||
        stored.id !== input.sessionId ||
        stored.userId !== input.userId ||
        stored.refreshHash !== input.expectedRefreshTokenHash ||
        stored.expiresAt.getTime() <= input.now.getTime()
      ) {
        return false;
      }
      stored = {
        ...stored,
        accessHash: input.nextAccessTokenHash,
        refreshHash: input.nextRefreshTokenHash,
        expiresAt: input.nextExpiresAt,
      };
      return true;
    },

    async revoke(sessionId, userId): Promise<void> {
      if (stored?.id === sessionId && stored.userId === userId) stored = null;
      revocations += 1;
    },

    async isAccessCredentialCurrent(input): Promise<boolean> {
      return Boolean(
        stored &&
          stored.id === input.sessionId &&
          stored.userId === input.userId &&
          stored.accessHash === input.accessTokenHash &&
          stored.expiresAt.getTime() > input.now.getTime(),
      );
    },
  };

  return {
    repository,
    snapshot: () => stored,
    revocations: () => revocations,
  };
}

describe("refresh-session rotation", () => {
  it("returns invalid without issuing or revoking when the session is absent", async () => {
    const store = makeRepository(null);
    const issueNext = () => {
      throw new Error("must not issue");
    };

    const result = await rotateRefreshSession({
      repository: store.repository,
      sessionId: "missing-session",
      userId: "user-1",
      refreshTokenHash: "refresh-old",
      now: new Date("2026-07-21T12:00:00.000Z"),
      issueNext,
    });

    expect(result.status).toBe("invalid");
    expect(store.revocations()).toBe(0);
  });

  it("atomically replaces both hashes on a valid single rotation", async () => {
    const store = makeRepository({
      id: "session-1",
      userId: "user-1",
      accessHash: "access-old",
      refreshHash: "refresh-old",
      expiresAt: new Date("2026-07-28T12:00:00.000Z"),
    });
    const nextExpiry = new Date("2026-07-29T12:00:00.000Z");

    const result = await rotateRefreshSession({
      repository: store.repository,
      sessionId: "session-1",
      userId: "user-1",
      refreshTokenHash: "refresh-old",
      now: new Date("2026-07-21T12:00:00.000Z"),
      issueNext: () => ({
        pair: "next-pair",
        accessTokenHash: "access-next",
        refreshTokenHash: "refresh-next",
        refreshExpiresAt: nextExpiry,
      }),
    });

    expect(result).toEqual({ status: "rotated", pair: "next-pair" });
    expect(store.snapshot()).toMatchObject({
      accessHash: "access-next",
      refreshHash: "refresh-next",
      expiresAt: nextExpiry,
    });
    expect(store.revocations()).toBe(0);
  });

  it("allows only one concurrent use and revokes the family on replay", async () => {
    let reads = 0;
    let releaseReads!: () => void;
    const allReadsArrived = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const barrier = async () => {
      reads += 1;
      if (reads === 2) releaseReads();
      await allReadsArrived;
    };

    const now = new Date("2026-07-21T12:00:00.000Z");
    const store = makeRepository(
      {
        id: "session-1",
        userId: "user-1",
        accessHash: "access-old",
        refreshHash: "refresh-old",
        expiresAt: new Date("2026-07-28T12:00:00.000Z"),
      },
      barrier,
    );

    let issued = 0;
    const rotate = () =>
      rotateRefreshSession({
        repository: store.repository,
        sessionId: "session-1",
        userId: "user-1",
        refreshTokenHash: "refresh-old",
        now,
        issueNext: () => {
          issued += 1;
          return {
            pair: `pair-${issued}`,
            accessTokenHash: `access-${issued}`,
            refreshTokenHash: `refresh-${issued}`,
            refreshExpiresAt: new Date("2026-07-28T12:00:01.000Z"),
          };
        },
      });

    const results = await Promise.all([rotate(), rotate()]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "replayed",
      "rotated",
    ]);
    expect(issued).toBe(2);
    expect(store.revocations()).toBe(1);
    expect(store.snapshot()).toBeNull();
  });

  it("revokes an expired session before issuing new tokens", async () => {
    const store = makeRepository({
      id: "session-1",
      userId: "user-1",
      accessHash: "access-old",
      refreshHash: "refresh-old",
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    let issued = false;

    const result = await rotateRefreshSession({
      repository: store.repository,
      sessionId: "session-1",
      userId: "user-1",
      refreshTokenHash: "refresh-old",
      now: new Date("2026-07-21T00:00:00.000Z"),
      issueNext: () => {
        issued = true;
        throw new Error("must not issue");
      },
    });

    expect(result.status).toBe("expired");
    expect(issued).toBe(false);
    expect(store.snapshot()).toBeNull();
  });

  it("revokes a token family when an older refresh token is replayed later", async () => {
    const store = makeRepository({
      id: "session-1",
      userId: "user-1",
      accessHash: "access-current",
      refreshHash: "refresh-current",
      expiresAt: new Date("2026-07-28T00:00:00.000Z"),
    });

    const result = await rotateRefreshSession({
      repository: store.repository,
      sessionId: "session-1",
      userId: "user-1",
      refreshTokenHash: "refresh-old",
      now: new Date("2026-07-21T00:00:00.000Z"),
      issueNext: () => {
        throw new Error("must not issue");
      },
    });

    expect(result.status).toBe("replayed");
    expect(store.revocations()).toBe(1);
    expect(store.snapshot()).toBeNull();
  });

  it("checks the current access hash and revocation state", async () => {
    const store = makeRepository({
      id: "session-1",
      userId: "user-1",
      accessHash: "access-current",
      refreshHash: "refresh-current",
      expiresAt: new Date("2026-07-28T00:00:00.000Z"),
    });
    const input = {
      sessionId: "session-1",
      userId: "user-1",
      accessTokenHash: "access-current",
      now: new Date("2026-07-21T00:00:00.000Z"),
    };

    await expect(
      isCurrentAccessSession(store.repository, input),
    ).resolves.toBe(true);
    await store.repository.revoke("session-1", "user-1");
    await expect(
      isCurrentAccessSession(store.repository, input),
    ).resolves.toBe(false);
  });
});
