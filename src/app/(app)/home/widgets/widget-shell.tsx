import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlpdComponentState } from "@/components/ui/component-state";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  count?: number;
  /** Shown on the right of the header — usually a link to the full view. */
  seeMoreHref?: string;
  seeMoreLabel?: string;
  state?: PlpdComponentState;
  children: ReactNode;
};

/**
 * Shared outer shell for every home-page widget. Keeps the title, optional
 * count badge, and "see more" link consistent across widgets.
 */
export function WidgetShell({
  title,
  description,
  icon,
  count,
  seeMoreHref,
  seeMoreLabel = "View all",
  state = "default",
  children,
}: Props) {
  return (
    <Card state={state} stateful>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle
            role="heading"
            aria-level={2}
            className="flex items-center gap-2 text-sm"
          >
            {icon}
            {title}
            {typeof count === "number" ? (
              <Badge variant="outline" className="text-[10px]">
                {count}
              </Badge>
            ) : null}
          </CardTitle>
          {description ? (
            <CardDescription className="mt-0.5 text-[11px]">
              {description}
            </CardDescription>
          ) : null}
        </div>
        {seeMoreHref ? (
          <Link
            href={seeMoreHref}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-cyan hover:underline"
          >
            {seeMoreLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}
