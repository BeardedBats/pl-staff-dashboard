import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PLPD_COMPONENT_STATES } from "@/components/ui/component-state";
import { EmptyState } from "@/components/ui/empty-state";
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
  TableValue,
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
    expect(
      screen.getByLabelText("Projected revenue requires access"),
    ).toHaveAttribute("data-plpd-state", "gated");
  });

  it("distinguishes zero and signed table values without chip colors", () => {
    render(
      <>
        <TableValue value={0}>0</TableValue>
        <TableValue value={2.4} delta>+2.4</TableValue>
        <TableValue value={-1.7} delta>−1.7</TableValue>
      </>,
    );

    expect(screen.getByText("0")).toHaveAttribute("data-value-tone", "zero");
    expect(screen.getByText("+2.4")).toHaveAttribute(
      "data-value-tone",
      "positive",
    );
    expect(screen.getByText("−1.7")).toHaveAttribute(
      "data-value-tone",
      "negative",
    );
  });

  it("exposes all seven PLPD widget states through one typed contract", () => {
    render(
      <>
        {PLPD_COMPONENT_STATES.slice(0, 3).map((state) => (
          <Card key={state} state={state} stateful data-testid={`card-${state}`}>
            <Badge>{state}</Badge>
          </Card>
        ))}
        <LoadingState title="Loading widget" />
        <ErrorState title="Widget unavailable" description="Try again." />
        <EmptyState title="No results" />
        <GatedValue label="Restricted metric" />
      </>,
    );

    for (const state of PLPD_COMPONENT_STATES.slice(0, 3)) {
      expect(screen.getByTestId(`card-${state}`)).toHaveAttribute(
        "data-plpd-state",
        state,
      );
    }
    expect(screen.getByText("Loading widget").closest("[data-plpd-state]"))
      .toHaveAttribute("data-plpd-state", "loading");
    expect(screen.getByText("Widget unavailable").closest("[data-plpd-state]"))
      .toHaveAttribute("data-plpd-state", "error");
    expect(screen.getByText("No results").closest("[data-plpd-state]"))
      .toHaveAttribute("data-plpd-state", "empty");
    expect(screen.getByLabelText("Restricted metric requires access"))
      .toHaveAttribute("data-plpd-state", "gated");
  });
});
