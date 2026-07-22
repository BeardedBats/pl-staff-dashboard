"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  hrefForPage?: (page: number) => string;
  className?: string;
  "aria-label"?: string;
};

type PageControlProps = {
  page: number;
  disabled: boolean;
  label: string;
  onPageChange?: (page: number) => void;
  hrefForPage?: (page: number) => string;
  children: React.ReactNode;
};

const controlClass =
  "plpd-pagination-control inline-flex shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PageControl({
  page,
  disabled,
  label,
  onPageChange,
  hrefForPage,
  children,
}: PageControlProps) {
  if (hrefForPage && !disabled) {
    return (
      <a className={controlClass} href={hrefForPage(page)} aria-label={label}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={controlClass}
      disabled={disabled || !onPageChange}
      aria-label={label}
      onClick={() => onPageChange?.(page)}
    >
      {children}
    </button>
  );
}

function Pagination({
  page,
  pageCount,
  onPageChange,
  hrefForPage,
  className,
  "aria-label": ariaLabel = "Pagination",
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex items-center justify-center gap-3.5", className)}
    >
      <PageControl
        page={safePage - 1}
        disabled={safePage <= 1}
        label="Previous page"
        onPageChange={onPageChange}
        hrefForPage={hrefForPage}
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </PageControl>
      <span
        aria-current="page"
        className="plpd-pagination-current inline-flex items-center justify-center font-data"
      >
        {safePage}
      </span>
      <PageControl
        page={safePage + 1}
        disabled={safePage >= safePageCount}
        label="Next page"
        onPageChange={onPageChange}
        hrefForPage={hrefForPage}
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </PageControl>
    </nav>
  );
}

export { Pagination };
export type { PaginationProps };
