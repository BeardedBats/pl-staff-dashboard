import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GatedValue } from "@/components/ui/gated-value";
import { NavigationItem } from "@/components/ui/navigation";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

describe("PLPD component primitives", () => {
  it("exposes semantic header, alert, loading, and error regions", () => {
    render(
      <>
        <PageHeader>
          <div>
            <PageHeaderTitle>Content calendar</PageHeaderTitle>
            <PageHeaderDescription>Plan the week.</PageHeaderDescription>
          </div>
        </PageHeader>
        <Alert variant="warning">
          <AlertTitle>Sync delayed</AlertTitle>
          <AlertDescription>Try again in a moment.</AlertDescription>
        </Alert>
        <LoadingState title="Loading calendar" />
        <ErrorState title="Calendar unavailable" description="Try again." />
      </>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Content calendar",
    );
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Calendar unavailable");
  });

  it("marks active navigation and changes pages through labeled controls", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <>
        <NavigationItem active asChild>
          <a href="/home">Home</a>
        </NavigationItem>
        <Pagination page={2} pageCount={4} onPageChange={onPageChange} />
      </>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders a semantic data table and a placeholder-only gated value", () => {
    render(
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Jane Pitcher</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <GatedValue label="Projected revenue" unit="USD" />
      </>,
    );

    expect(screen.getByRole("table")).toHaveTextContent("Jane Pitcher");
    expect(
      screen.getByLabelText("Projected revenue requires access"),
    ).toHaveTextContent("••• USD");
  });
});
