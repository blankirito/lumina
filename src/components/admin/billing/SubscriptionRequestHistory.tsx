import React from "react";

export type SubscriptionPaymentRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_months: number;
  requested_total_amount: number | string;
  approved_months: number | null;
  approved_total_amount: number | string | null;
  tng_reference: string;
  review_note: string | null;
  created_at: string;
  approved_access_ends_at: string | null;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function periodAmount(months: number, amount: number | string) {
  return `${months} month${months === 1 ? "" : "s"} · RM ${Number(amount).toFixed(2)}`;
}

export default function SubscriptionRequestHistory({ requests }: { requests: SubscriptionPaymentRequest[] }) {
  return <section aria-label="Subscription request history">
    <h3 className="font-display text-xl text-on-surface">Subscription request history</h3>
    <p className="mt-1 text-xs text-on-surface-variant">These are payment request records, not invoices or payment receipts.</p>
    {requests.length === 0 ? <p className="mt-4 rounded-2xl bg-surface-container p-6 text-sm">No subscription requests yet.</p> :
      <ul className="mt-4 space-y-3">{requests.map((request) => <li key={request.id} className="rounded-2xl bg-surface-container p-4 text-sm">
        <p className="font-semibold">{request.status === "pending" ? "Pending review" : request.status === "approved" ? "Approved" : "Rejected"} · {dateLabel(request.created_at)}</p>
        <p className="mt-2">Requested: {periodAmount(request.requested_months, request.requested_total_amount)}</p>
        {request.status === "approved" && request.approved_months !== null && request.approved_total_amount !== null ? <p>Approved: {periodAmount(request.approved_months, request.approved_total_amount)}</p> : null}
        {request.status === "approved" && request.approved_access_ends_at ? <p>Access through {dateLabel(request.approved_access_ends_at)}</p> : null}
        <p className="mt-2 break-all">Reference: {request.tng_reference}</p>
        {request.review_note ? <p className="mt-2 break-words">Review: {request.review_note}</p> : null}
      </li>)}</ul>}
  </section>;
}
