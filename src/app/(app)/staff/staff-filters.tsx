"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StaffFiltersProps = {
  initialSearch: string;
  initialRole: string;
  initialSite: string;
  initialTeam: string;
  teams: Array<{ id: string; name: string }>;
};

const ALL = "__all__";

export function StaffFilters({
  initialSearch,
  initialRole,
  initialSite,
  initialTeam,
  teams,
}: StaffFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(initialSearch);

  // Debounce the text search.
  React.useEffect(() => {
    const id = setTimeout(() => {
      pushParam("search", search);
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function pushParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.replace(`/staff?${next.toString()}`);
  }

  function resetAll() {
    setSearch("");
    router.replace("/staff");
  }

  const hasAny =
    initialSearch || initialRole || initialSite || initialTeam || search;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-zero" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-8"
        />
      </div>

      <Select
        value={initialRole || ALL}
        onValueChange={(value) => pushParam("role", value)}
      >
        <SelectTrigger aria-label="Filter staff by role" className="w-[140px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All roles</SelectItem>
          <SelectItem value="writer">Writer</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="graphics">Graphics</SelectItem>
          <SelectItem value="manager">Manager</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="eic">EIC</SelectItem>
          <SelectItem value="operations">Operations</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={initialSite || ALL}
        onValueChange={(value) => pushParam("site", value)}
      >
        <SelectTrigger aria-label="Filter staff by site" className="w-[120px]">
          <SelectValue placeholder="Site" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sites</SelectItem>
          <SelectItem value="pl">Pitcher List</SelectItem>
          <SelectItem value="qb">QB List</SelectItem>
          <SelectItem value="both">Both</SelectItem>
        </SelectContent>
      </Select>

      {teams.length > 0 ? (
        <Select
          value={initialTeam || ALL}
          onValueChange={(value) => pushParam("team", value)}
        >
          <SelectTrigger aria-label="Filter staff by team" className="w-[180px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {hasAny ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetAll}
          className="text-text-zero"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
