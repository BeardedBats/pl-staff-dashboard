import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoWorkspace } from "./seo-workspace";

describe("SEO workspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("separates Pitcher List analysis from read-only Yoast values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workspace: {
          title: "Fantasy Baseball Rankings for 2026",
          contentText: "Fantasy baseball rankings open the article. First, compare pitchers. Finally, choose targets.",
          headings: ["Fantasy Baseball Rankings"],
          focusKeyphrase: "fantasy baseball rankings",
          metaDescription: "A practical fantasy baseball rankings guide with pitcher targets, values, and draft advice for the 2026 season.",
          wpModifiedAt: "2026-07-22T00:00:00.000Z",
          titleScore: { total: 80 },
          findings: [],
          yoast: {
            title: "Yoast title",
            description: "Yoast description",
            canonical: "https://example.test/post",
            robots: null,
            focusKeyphrase: "fantasy baseball rankings",
            writable: false,
          },
        },
      }),
    }));

    render(
      <SeoWorkspace
        entryId="entry-1"
        fallbackTitle="Fallback"
        canApprove={false}
        onApplied={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Pitcher List title studio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pitcher List analysis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yoast-reported values" })).toBeInTheDocument();
    expect(screen.getByText("Manager approval required")).toBeInTheDocument();
    expect(screen.getByText(/three schema-registered Yoast strings/)).toBeInTheDocument();
  });
});
