import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole, AppSite, CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  addTeamMember: vi.fn(),
  getTeamById: vi.fn(),
  removeTeamMember: vi.fn(),
  setMemberPrimary: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/current-user")>()),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/teams/data", () => ({
  addTeamMember: mocks.addTeamMember,
  getTeamById: mocks.getTeamById,
  removeTeamMember: mocks.removeTeamMember,
  setMemberPrimary: mocks.setMemberPrimary,
}));

import { POST as addMember } from "./[id]/members/route";
import {
  DELETE as removeMember,
  PATCH as setPrimary,
} from "./[id]/members/[userId]/route";

const teamId = "20000000-0000-4000-8000-000000000001";
const targetUserId = "30000000-0000-4000-8000-000000000001";

function user(
  id: string,
  roleRows: Array<{ role: AppRole; site: AppSite }>,
): CurrentUser {
  return {
    id,
    wp_user_id: 1,
    wp_site: "both",
    email: `${id}@example.test`,
    display_name: id,
    avatar_url: null,
    bio: null,
    timezone: "UTC",
    theme: "dark",
    can_publish: false,
    onboarding_completed: true,
    roles: Array.from(new Set(roleRows.map((row) => row.role))),
    role_rows: roleRows,
    session_id: `session-${id}`,
  };
}

function team(site: AppSite, managerId = "team-manager") {
  return {
    id: teamId,
    name: "Test Team",
    description: null,
    site,
    manager_id: managerId,
    manager_name: "Manager",
    manager_avatar_url: null,
    member_count: 0,
    created_at: "2026-07-21T12:00:00.000Z",
    members: [],
  };
}

function addRequest(isPrimary = false) {
  return new Request(`http://localhost/api/teams/${teamId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: targetUserId,
      is_primary: isPrimary,
    }),
  });
}

const addContext = { params: Promise.resolve({ id: teamId }) };
const memberContext = {
  params: Promise.resolve({ id: teamId, userId: targetUserId }),
};

describe("team membership authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addTeamMember.mockResolvedValue({ ok: true });
    mocks.removeTeamMember.mockResolvedValue(true);
    mocks.setMemberPrimary.mockResolvedValue({ ok: true });
  });

  it("rejects an anonymous add before loading the team", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await addMember(addRequest(), addContext);

    expect(response.status).toBe(401);
    expect(mocks.getTeamById).not.toHaveBeenCalled();
    expect(mocks.addTeamMember).not.toHaveBeenCalled();
  });

  it("does not let an admin grant cross-site team membership", async () => {
    mocks.getCurrentUser.mockResolvedValue(
      user("pl-admin", [{ role: "admin", site: "pl" }]),
    );
    mocks.getTeamById.mockResolvedValue(team("qb"));

    const response = await addMember(addRequest(), addContext);

    expect(response.status).toBe(403);
    expect(mocks.addTeamMember).not.toHaveBeenCalled();
  });

  it("does not let a same-site manager mutate someone else's team", async () => {
    mocks.getCurrentUser.mockResolvedValue(
      user("other-manager", [{ role: "manager", site: "pl" }]),
    );
    mocks.getTeamById.mockResolvedValue(team("pl", "team-manager"));

    const response = await addMember(addRequest(), addContext);

    expect(response.status).toBe(403);
    expect(mocks.addTeamMember).not.toHaveBeenCalled();
  });

  it("lets the exact site-scoped manager add a member", async () => {
    const ownTeam = team("pl", "team-manager");
    mocks.getCurrentUser.mockResolvedValue(
      user("team-manager", [{ role: "manager", site: "pl" }]),
    );
    mocks.getTeamById
      .mockResolvedValueOnce(ownTeam)
      .mockResolvedValueOnce({ ...ownTeam, member_count: 1 });

    const response = await addMember(addRequest(true), addContext);

    expect(response.status).toBe(200);
    expect(mocks.addTeamMember).toHaveBeenCalledWith(
      teamId,
      targetUserId,
      true,
    );
  });

  it("requires both-site authority even from the exact manager of a both team", async () => {
    mocks.getCurrentUser.mockResolvedValue(
      user("team-manager", [{ role: "manager", site: "pl" }]),
    );
    mocks.getTeamById.mockResolvedValue(team("both", "team-manager"));

    const response = await removeMember(
      new Request("http://localhost", { method: "DELETE" }),
      memberContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.removeTeamMember).not.toHaveBeenCalled();
  });

  it("lets a both-site exact manager remove a member", async () => {
    const ownTeam = team("both", "team-manager");
    mocks.getCurrentUser.mockResolvedValue(
      user("team-manager", [{ role: "manager", site: "both" }]),
    );
    mocks.getTeamById
      .mockResolvedValueOnce(ownTeam)
      .mockResolvedValueOnce(ownTeam);

    const response = await removeMember(
      new Request("http://localhost", { method: "DELETE" }),
      memberContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.removeTeamMember).toHaveBeenCalledWith(teamId, targetUserId);
  });

  it("lets a site admin set a member's primary team", async () => {
    const siteTeam = team("qb");
    mocks.getCurrentUser.mockResolvedValue(
      user("qb-admin", [{ role: "admin", site: "qb" }]),
    );
    mocks.getTeamById
      .mockResolvedValueOnce(siteTeam)
      .mockResolvedValueOnce(siteTeam);

    const response = await setPrimary(
      new Request("http://localhost", { method: "PATCH" }),
      memberContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.setMemberPrimary).toHaveBeenCalledWith(
      teamId,
      targetUserId,
    );
  });
});
