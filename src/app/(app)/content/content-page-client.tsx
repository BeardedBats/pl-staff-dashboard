"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EntriesTable } from "@/components/entries/entries-table";
import { CreateEntryDialog } from "@/components/entries/create-entry-dialog";
import { BulkCreateEntryDialog } from "@/components/entries/bulk-create-dialog";
import type { EntryCategory, EntryTier } from "@/lib/entries/queries";
import type { SavedViewRecord } from "@/lib/views/data";

type ContentPageClientProps = {
  tiers: EntryTier[];
  categories: EntryCategory[];
  initialViews: SavedViewRecord[];
  manageableSites: Array<"pl" | "qb">;
};

export function ContentPageClient({
  tiers,
  categories,
  initialViews,
  manageableSites,
}: ContentPageClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = React.useState(false);
  // Bumped whenever a new entry is created so EntriesTable re-fetches.
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <>
      <EntriesTable
        key={refreshKey}
        tiers={tiers}
        initialViews={initialViews}
        manageableSites={manageableSites}
        onCreateClick={() => setCreateOpen(true)}
        onBulkCreateClick={() => setBulkCreateOpen(true)}
      />

      <CreateEntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tiers={tiers}
        categories={categories}
        onCreated={() => {
          setCreateOpen(false);
          setRefreshKey((k) => k + 1);
          router.refresh();
        }}
      />

      <BulkCreateEntryDialog
        open={bulkCreateOpen}
        onOpenChange={setBulkCreateOpen}
        tiers={tiers}
        categories={categories}
        onCreated={() => {
          setRefreshKey((k) => k + 1);
          router.refresh();
        }}
      />
    </>
  );
}
