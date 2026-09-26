import { cn } from "@/lib/utils";

type UserAvatarProps = {
  displayName: string;
  /** Retained for caller compatibility; Kel presents names, not portraits. */
  avatarUrl: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
};

export function UserAvatar({ displayName, className }: UserAvatarProps) {
  return (
    <span className={cn("kel-user-name min-w-0 break-words font-kel-ui text-sm font-medium text-text-team", className)}>
      {displayName.trim() || "Unnamed user"}
    </span>
  );
}
