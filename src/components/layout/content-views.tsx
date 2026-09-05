import Link from "next/link";
export function ContentViews({ active }: { active: "table" | "calendar" }) {
  return <nav aria-label="Content views" className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
    {([ ["table", "/content", "Table"], ["calendar", "/calendar", "Calendar"] ] as const).map(([key, href, label]) =>
      <Link key={key} href={href} aria-current={key === active ? "page" : undefined}
        className={`rounded-md px-4 py-2 text-sm font-medium ${key === active ? "bg-cyan text-black" : "text-text-team hover:bg-surface-3"}`}>{label}</Link>)}
  </nav>;
}
