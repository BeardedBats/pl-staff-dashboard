"use client";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import type { ReactNode } from "react";
export function SettingsTabs({ value, children }: { value: string; children: ReactNode }) {
  const router = useRouter();
  return <Tabs value={value} onValueChange={(tab) => router.push(`/settings?tab=${tab}`)} className="w-full">{children}</Tabs>;
}
