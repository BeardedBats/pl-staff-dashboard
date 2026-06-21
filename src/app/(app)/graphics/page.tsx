import { listGraphicRequests } from "@/lib/graphics/data";
import { getCurrentUser } from "@/lib/auth/current-user";
import { GraphicsPageClient } from "./graphics-page-client";

export const metadata = {
  title: "Graphic Requests",
};

export default async function GraphicsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  // Server-side initial fetch: everything, unfiltered.
  const requests = await listGraphicRequests({ limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">
          Graphic Requests
        </h1>
        <p className="mt-1 text-sm text-text-team">
          Everything the graphics team is working on, across both sites.
        </p>
      </div>

      <GraphicsPageClient
        initialRequests={requests}
        currentUserId={viewer.id}
      />
    </div>
  );
}
