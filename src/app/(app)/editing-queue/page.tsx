import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { authorizedSiteScope } from "@/lib/auth/authorization";
import { listEntries } from "@/lib/entries/queries";
import { EditingQueueClient } from "./editing-queue-client";

export const metadata = { title: "Editing Queue" };

export default async function EditingQueuePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  const editorScope = authorizedSiteScope(
    viewer,
    "editor",
    "manager",
    "admin",
    "eic",
    "operations",
  );
  if (!editorScope) redirect("/home");

  const { entries } = await listEntries({
    editorStatusIn: ["ready_for_edit", "edited"],
    site: editorScope,
    sortBy: "publish_date",
    sortDir: "asc",
    limit: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">Editing Queue</h1>
        <p className="mt-1 text-sm text-text-team">
          Risk-first editorial work with deadline signals, saved queue views, and atomic multi-claiming.
        </p>
      </div>
      <EditingQueueClient
        entries={entries}
        viewerId={viewer.id}
        nowIso={new Date().toISOString()}
      />
    </div>
  );
}
