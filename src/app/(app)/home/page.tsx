import {
  canViewAnalytics,
  getCurrentUser,
  hasRole,
  isManagerPlus,
} from "@/lib/auth/current-user";
import { listPendingClaims } from "@/lib/claims/data";
import { listPendingArchiveRequests } from "@/lib/archive-requests/data";
import {
  getAnalyticsMini,
  getEditorQueuePreview,
  getMyActiveClaims,
  getMyActiveEdits,
  getMyActiveGraphics,
  getMyDraftsToApprove,
  getMySubmittedInFlight,
  getMyUpcomingDeadlines,
  getOpenGraphicRequests,
  getPipelineHealth,
  getStaleEntries,
  getUnclaimedWriterSlots,
  getWpSyncHealth,
  isEicOrOps,
  isEditorRole,
  isGraphicsRole,
  isWriterRole,
} from "@/lib/home/widgets";
import { ManagerInbox } from "./manager-inbox";
import {
  MyActiveClaimsWidget,
  MyDraftsToApproveWidget,
  MySubmittedInFlightWidget,
  MyUpcomingDeadlinesWidget,
  UnclaimedSlotsWidget,
} from "./widgets/writer-widgets";
import {
  EditorQueueWidget,
  MyActiveEditsWidget,
} from "./widgets/editor-widgets";
import {
  MyActiveGraphicsWidget,
  OpenGraphicRequestsWidget,
} from "./widgets/graphics-widgets";
import {
  AnalyticsMiniWidget,
  PipelineHealthWidget,
  StaleEntriesWidget,
  WpSyncHealthWidget,
} from "./widgets/eic-widgets";

export const metadata = {
  title: "Home",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const writerFit = isWriterRole(user.roles);
  const editorFit = isEditorRole(user.roles);
  const graphicsFit = isGraphicsRole(user.roles);
  const eicFit = isEicOrOps(user.roles);
  const managerFit = isManagerPlus(user);
  // Writers don't see "unclaimed" slots if they have nothing but graphics,
  // and we want to avoid bombarding eic/ops with too many empty cards.
  const pureWriter =
    hasRole(user, "writer") && !editorFit && !graphicsFit && !eicFit;

  // Fan out all widget data in parallel. Every fetcher is read-only and
  // independent, so we wait once and render once.
  const [
    myClaims,
    mySubmitted,
    myDeadlines,
    myDrafts,
    unclaimedSlots,
    editorQueue,
    myEdits,
    openGraphics,
    myGraphics,
    pipelineHealth,
    wpSyncHealth,
    analyticsMini,
    stale,
    pendingClaims,
    pendingArchives,
  ] = await Promise.all([
    writerFit ? getMyActiveClaims(user.id) : Promise.resolve([]),
    writerFit ? getMySubmittedInFlight(user.id) : Promise.resolve([]),
    writerFit ? getMyUpcomingDeadlines(user.id) : Promise.resolve([]),
    writerFit ? getMyDraftsToApprove(user.id) : Promise.resolve([]),
    writerFit ? getUnclaimedWriterSlots(user.wp_site) : Promise.resolve([]),
    editorFit ? getEditorQueuePreview(user.wp_site) : Promise.resolve([]),
    editorFit ? getMyActiveEdits(user.id) : Promise.resolve([]),
    graphicsFit || eicFit ? getOpenGraphicRequests() : Promise.resolve([]),
    graphicsFit ? getMyActiveGraphics(user.id) : Promise.resolve([]),
    eicFit ? getPipelineHealth(user.wp_site) : Promise.resolve(null),
    eicFit ? getWpSyncHealth() : Promise.resolve(null),
    canViewAnalytics(user) ? getAnalyticsMini() : Promise.resolve(null),
    eicFit ? getStaleEntries(user.wp_site) : Promise.resolve([]),
    managerFit ? listPendingClaims(user) : Promise.resolve([]),
    managerFit ? listPendingArchiveRequests(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Welcome, {user.display_name.split(" ")[0]}.
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          You&apos;re signed in as{" "}
          <span className="font-mono text-text-primary">{user.email}</span>
          {user.roles.length > 0 ? (
            <>
              {" "}
              · Roles:{" "}
              <span className="font-mono uppercase tracking-wider text-cyan">
                {user.roles.join(" · ")}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {/* Manager inbox first — approvals block work */}
      {managerFit ? (
        <ManagerInbox
          initialClaims={pendingClaims}
          initialArchives={pendingArchives}
        />
      ) : null}

      {/* EIC/Ops — pipeline health + analytics lead everything else */}
      {eicFit && pipelineHealth ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PipelineHealthWidget health={pipelineHealth} />
          </div>
          <div className="space-y-4">
            {analyticsMini ? <AnalyticsMiniWidget data={analyticsMini} /> : null}
            {wpSyncHealth ? <WpSyncHealthWidget health={wpSyncHealth} /> : null}
          </div>
        </div>
      ) : null}

      {/* Writer row */}
      {writerFit ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MyActiveClaimsWidget entries={myClaims} />
          <MyUpcomingDeadlinesWidget entries={myDeadlines} />
          <MySubmittedInFlightWidget entries={mySubmitted} />
          <MyDraftsToApproveWidget entries={myDrafts} />
          {pureWriter ? (
            <UnclaimedSlotsWidget entries={unclaimedSlots} />
          ) : null}
        </div>
      ) : null}

      {/* Editor row */}
      {editorFit ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EditorQueueWidget entries={editorQueue} />
          </div>
          <MyActiveEditsWidget entries={myEdits} />
        </div>
      ) : null}

      {/* Graphics row */}
      {graphicsFit ? (
        <div className="grid gap-4 md:grid-cols-2">
          <OpenGraphicRequestsWidget items={openGraphics} />
          <MyActiveGraphicsWidget items={myGraphics} />
        </div>
      ) : null}

      {/* Multi-role writer sees unclaimed + stale at the bottom */}
      {!pureWriter && writerFit ? (
        <div className="grid gap-4 md:grid-cols-2">
          <UnclaimedSlotsWidget entries={unclaimedSlots} />
          {eicFit ? <StaleEntriesWidget entries={stale} /> : null}
        </div>
      ) : null}

      {/* Pure EIC/Ops: stale content at the bottom if writer-fit didn't already render it */}
      {eicFit && !writerFit ? (
        <StaleEntriesWidget entries={stale} />
      ) : null}
    </div>
  );
}
