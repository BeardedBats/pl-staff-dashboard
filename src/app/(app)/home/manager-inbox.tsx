"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Check, Hand, Inbox, Loader2, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserAvatar } from "@/components/users/user-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClaimRecord } from "@/lib/claims/data";
import type { ArchiveRequestRecord } from "@/lib/archive-requests/data";

type Props = {
  initialClaims: ClaimRecord[];
  initialArchives: ArchiveRequestRecord[];
};

export function ManagerInbox({ initialClaims, initialArchives }: Props) {
  const router = useRouter();
  const [claims, setClaims] = React.useState(initialClaims);
  const [archives, setArchives] = React.useState(initialArchives);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function refresh() {
    const [claimsRes, archivesRes] = await Promise.all([
      fetch("/api/claims").then((r) => r.json()),
      fetch("/api/archive-requests").then((r) => r.json()),
    ]);
    setClaims(claimsRes.claims ?? []);
    setArchives(archivesRes.requests ?? []);
    router.refresh();
  }

  async function resolveClaim(claimId: string, action: "approve" | "deny") {
    setBusyId(claimId);
    try {
      await fetch(`/api/claims/${claimId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function resolveArchive(requestId: string, action: "approve" | "deny") {
    setBusyId(requestId);
    try {
      await fetch(`/api/archive-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const totalPending = claims.length + archives.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Inbox className="h-4 w-4 text-cyan" />
          <CardTitle className="text-base">Manager inbox</CardTitle>
          {totalPending > 0 ? (
            <Badge variant="cyan">{totalPending}</Badge>
          ) : null}
        </div>
        <CardDescription>
          Pending claim and archive requests from your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Claims */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
            <Hand className="h-3 w-3" />
            Claim requests ({claims.length})
          </h4>
          {claims.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/50 p-4 text-center text-xs text-text-zero">
              No pending claim requests.
            </p>
          ) : (
            <ul className="space-y-2">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-surface-3/40 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                    <UserAvatar
                      displayName={claim.claimer_name}
                      avatarUrl={claim.claimer_avatar}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-cell">
                        <span className="font-medium">
                          {claim.claimer_name}
                        </span>{" "}
                        wants to write{" "}
                        <Link
                          href="/content"
                          className="font-medium text-cyan hover:underline"
                        >
                          {claim.entry_title}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-zero">
                        {formatDate(claim.created_at, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        · {claim.entry_site.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveClaim(claim.id, "deny")}
                      disabled={busyId === claim.id}
                      className="text-destructive"
                    >
                      <X className="h-3 w-3" />
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => resolveClaim(claim.id, "approve")}
                      disabled={busyId === claim.id}
                    >
                      {busyId === claim.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Archive requests */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
            <Archive className="h-3 w-3" />
            Archive requests ({archives.length})
          </h4>
          {archives.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/50 p-4 text-center text-xs text-text-zero">
              No pending archive requests.
            </p>
          ) : (
            <ul className="space-y-2">
              {archives.map((req) => (
                <li
                  key={req.id}
                  className="rounded-md border border-border bg-surface-3/40 p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                      <UserAvatar
                        displayName={req.requester_name}
                        avatarUrl={req.requester_avatar}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-cell">
                          <span className="font-medium">
                            {req.requester_name}
                          </span>{" "}
                          wants to archive{" "}
                          <span className="font-medium text-text-cell">
                            {req.entry_title}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-zero">
                          {formatDate(req.created_at, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveArchive(req.id, "deny")}
                        disabled={busyId === req.id}
                        className="text-destructive"
                      >
                        <X className="h-3 w-3" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resolveArchive(req.id, "approve")}
                        disabled={busyId === req.id}
                      >
                        {busyId === req.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Approve
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 rounded-sm border border-border bg-card px-3 py-2 text-xs text-text-team">
                    &ldquo;{req.reason}&rdquo;
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {totalPending === 0 ? (
          <EmptyState
            title="Inbox zero"
            description="No pending claim or archive requests right now."
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
