"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RecoveryActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  async function run(kind: "posts" | "history") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(kind === "posts" ? "/api/connections/wordpress" : "/api/admin/historical-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "posts" ? {} : { site: "pl", start_page: page, max_pages: 1 }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error ?? "Recovery failed. You can retry this page safely.");
      if (kind === "history") {
        setPage(data.nextPage ?? 1);
        setMessage(data.nextPage ? `Page ${page} saved. Continue with page ${data.nextPage}.` : "Article scan finished. Review analytics coverage next.");
      } else setMessage("WordPress refreshed. Unresolved authors remain in the recovery queue.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recovery failed. Retry safely."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => void run("posts")}>Refresh WordPress</Button>
      <Button variant="outline" disabled={busy} onClick={() => void run("history")}>{page === 1 ? "Repair published articles" : `Continue repair: page ${page}`}</Button>
    </div>
    <p className="text-xs text-text-zero">Repair processes 100 published articles at a time. Existing records keep their assignments. Missing author links are repaired when accounts exist.</p>
    {message && <p role="status" className="text-sm text-text-team">{message}</p>}
  </div>;
}
