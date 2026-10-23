import {
  Check,
  Clock3,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import type { MerchantPlanCode } from "@/lib/merchants/merchantBilling";
import ManualTngPaymentForm from "./ManualTngPaymentForm";
import SubscriptionRequestHistory, { type SubscriptionPaymentRequest } from "./SubscriptionRequestHistory";

type BillingStatusCardProps = {
  billing: {
    storeName: string;
    status: string;
    planCode: MerchantPlanCode;
    monthlyPrice: number;
    foundingPriceLockedUntil: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialDaysRemaining: number | null;
    currentPeriodEndsAt: string | null;
    paymentGraceEndsAt: string | null;
    tngPayment: {
      recipientName: string;
      recipientNumber: string;
    } | null;
    paymentRequests: SubscriptionPaymentRequest[];
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusLabel(status: string) {
  if (status === "trialing") return "14-day trial";
  if (status === "complimentary") return "Complimentary";
  if (status === "active") return "Active";
  if (status === "past_due") return "Payment needed";
  if (status === "suspended") return "Store paused";

  return "Not started";
}

function getStatusClass(status: string) {
  if (status === "trialing") {
    return "bg-secondary-container text-on-secondary-container";
  }

  if (status === "complimentary" || status === "active") {
    return "bg-primary-container text-on-primary-container";
  }

  if (status === "past_due") {
    return "bg-error-container text-error";
  }

  return "bg-surface-container text-on-surface-variant";
}

export default function BillingStatusCard({
  billing,
}: BillingStatusCardProps) {
  const isTrialing = billing.status === "trialing";
  const isComplimentary =
    billing.planCode === "lumina-monthly-complimentary";
  const isFoundingPlan =
    billing.planCode === "lumina-monthly-founding" &&
    billing.monthlyPrice === 29;

  const trialProgress =
    billing.trialDaysRemaining === null
      ? 0
      : Math.min(
        100,
        Math.max(0, ((14 - billing.trialDaysRemaining) / 14) * 100),
      );

  return (
    <div className="mt-6 space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-surface-container-low p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary-fixed/30 blur-2xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
              Merchant portal
            </span>
          </div>

          <span className="rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-semibold text-secondary">
            Subscription
          </span>
        </div>

        <div className="relative mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
              Boutique
            </p>
            <h2 className="mt-1 font-display text-2xl text-on-surface">
              {billing.storeName}
            </h2>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(billing.status)}`}
          >
            {getStatusLabel(billing.status)}
          </span>
        </div>

        {isComplimentary ? (
          <div className="relative mt-5 flex items-start gap-3 rounded-xl bg-primary-container/45 p-4">
            <Sparkles className="mt-0.5 shrink-0 text-primary" size={18} />
            <div>
              <p className="text-sm font-semibold text-on-surface">
                Complimentary access is active
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Your store can continue using Lumina without payment.
              </p>
            </div>
          </div>
        ) : isTrialing && billing.trialEndsAt ? (
          <>
            <div className="relative mt-5 flex items-start gap-3 rounded-xl bg-surface-container-highest p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed-dim text-on-primary-fixed">
                <Clock3 size={17} />
              </div>

              <div>
                <p className="text-sm font-semibold text-on-surface">
                  {billing.trialDaysRemaining} day
                  {billing.trialDaysRemaining === 1 ? "" : "s"} remaining
                  in your free trial
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Expires {formatDate(billing.trialEndsAt)}
                </p>
              </div>
            </div>

            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${trialProgress}%` }}
              />
            </div>
          </>
        ) : billing.paymentGraceEndsAt ? (
          <div className="relative mt-5 flex items-start gap-3 rounded-xl bg-error-container/35 p-4">
            <Clock3 className="mt-0.5 shrink-0 text-error" size={18} />
            <div>
              <p className="text-sm font-semibold text-on-surface">
                Your store remains available until{" "}
                {formatDate(billing.paymentGraceEndsAt)}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Complete subscription payment before this date to avoid a pause.
              </p>
            </div>
          </div>
        ) : billing.currentPeriodEndsAt ? (
          <div className="relative mt-5 flex items-start gap-3 rounded-xl bg-surface-container-highest p-4">
            <Clock3 className="mt-0.5 shrink-0 text-primary" size={18} />
            <div>
              <p className="text-sm font-semibold text-on-surface">
                Current period ends {formatDate(billing.currentPeriodEndsAt)}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Your subscription remains active until that date.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-outline/10 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            {isComplimentary ? "Access granted" : "Recommended"}
          </span>

          <span className="text-xs font-medium text-on-surface-variant">
            {isComplimentary
              ? "Complimentary access"
              : isFoundingPlan
                ? "Founding merchant"
                : "Standard tier"}
          </span>
        </div>

        <h3 className="mt-4 font-display text-2xl text-on-surface">
          {isComplimentary
            ? "Complimentary access"
            : "Lumina Store — Monthly"}
        </h3>

        {isComplimentary ? (
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Your subscription payment is waived. No payment details are needed.
          </p>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-semibold text-on-surface">
                RM {billing.monthlyPrice.toFixed(2)}
              </span>
              <span className="text-sm text-on-surface-variant">/ month</span>
            </div>

            <p className="mt-1 text-xs text-on-surface-variant">
              Billed monthly when secure checkout is available.
            </p>
          </>
        )}

        {isFoundingPlan && billing.foundingPriceLockedUntil ? (
          <p className="mt-3 rounded-lg bg-secondary-container/45 px-3 py-2 text-xs leading-relaxed text-on-secondary-container">
            Your RM29 founding price is locked until{" "}
            {formatDate(billing.foundingPriceLockedUntil)}.
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          {[
            "14-day card-free trial",
            "Your merchant dashboard and storefront",
            "Subscription management from one place",
          ].map((benefit) => (
            <div key={benefit} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary">
                <Check size={13} />
              </span>
              <span className="text-sm text-on-surface">{benefit}</span>
            </div>
          ))}
        </div>

        {isComplimentary ? (
          <div className="mt-6 flex items-start justify-center gap-2 rounded-xl bg-primary-container/40 px-4 py-3.5 text-center text-xs leading-relaxed text-on-primary-container">
            <Sparkles className="mt-0.5 shrink-0" size={16} />
            <p>Your access is managed by Lumina Admin.</p>
          </div>
        ) : (
          <>
            {billing.tngPayment ? (
              <ManualTngPaymentForm
                planCode={billing.planCode}
                foundingPriceLockedUntil={billing.foundingPriceLockedUntil}
                recipientName={billing.tngPayment.recipientName}
                recipientNumber={billing.tngPayment.recipientNumber}
                hasPendingRequest={billing.paymentRequests.some(
                  (request) => request.status === "pending",
                )}
              />
            ) : (
              <p className="mt-6 rounded-xl bg-error-container/35 px-4 py-3 text-sm text-error">
                TNG payment instructions are not configured yet. Please contact Lumina
                Admin.
              </p>
            )}

            <div className="mt-3 flex items-start justify-center gap-2 px-2 text-center text-xs leading-relaxed text-on-surface-variant">
              <LockKeyhole className="mt-0.5 shrink-0 text-secondary" size={15} />
              <p>No payment details are collected on this page.</p>
            </div>
          </>
        )}
      </section>

      <SubscriptionRequestHistory requests={billing.paymentRequests} />
    </div>
  );
}
