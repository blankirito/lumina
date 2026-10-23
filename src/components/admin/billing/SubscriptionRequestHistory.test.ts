import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SubscriptionRequestHistory from "./SubscriptionRequestHistory";

const request = { id: "synthetic-request", status: "approved" as const, requested_months: 3, requested_total_amount: 177, approved_months: 1, approved_total_amount: 59, tng_reference: "SYNTHETIC-NO-TRANSFER", review_note: "Synthetic review", created_at: "2026-10-21T12:00:00Z", approved_access_ends_at: "2026-11-21T12:00:00Z" };

describe("subscription request history", () => {
  it("shows the approved amount and duration separately from the request", () => {
    const html = renderToStaticMarkup(createElement(SubscriptionRequestHistory, { requests: [request] }));
    expect(html).toContain("Requested: 3 months · RM 177.00");
    expect(html).toContain("Approved: 1 month · RM 59.00");
    expect(html).toContain("SYNTHETIC-NO-TRANSFER");
    expect(html).toContain("Synthetic review");
    expect(html).not.toContain("0 invoices");
  });
  it("shows pending and rejected requests without claiming approved access", () => {
    for (const status of ["pending", "rejected"] as const) {
      const html = renderToStaticMarkup(createElement(SubscriptionRequestHistory, { requests: [{ ...request, status, approved_months: null, approved_total_amount: null, approved_access_ends_at: null }] }));
      expect(html).toContain(status === "pending" ? "Pending review" : "Rejected");
      expect(html).not.toContain("Approved:");
    }
  });
  it("escapes supplied reference and review text", () => {
    const html = renderToStaticMarkup(createElement(SubscriptionRequestHistory, { requests: [{ ...request, tng_reference: "<script>test</script>", review_note: "<img onerror=test>" }] }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  it("has an honest empty state without promising generated receipts", () => {
    const html = renderToStaticMarkup(createElement(SubscriptionRequestHistory, { requests: [] }));
    expect(html).toContain("No subscription requests yet");
    expect(html).not.toContain("will appear");
  });
});
