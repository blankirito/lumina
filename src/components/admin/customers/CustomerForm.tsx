"use client";

import type { AdminCustomer } from "@/data/adminCustomers";
import type { AdminCustomerDetail } from "@/data/adminCustomerDetails";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type CustomerFormProps = {
  customer: AdminCustomer;
  detail: AdminCustomerDetail;
  backHref: string;
};

export default function CustomerForm({
  customer,
  detail,
  backHref,
}: CustomerFormProps) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: detail.phone,
    street: detail.address.street,
    city: detail.address.city,
    state: detail.address.state,
    postalCode: detail.address.postalCode,
    country: detail.address.country,
    accountStatus: customer.status === "Inactive" ? "Inactive" : "Active",
  });

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // UI stage only — saving will be connected during backend work.
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-6 pb-28">
      <div className="mx-auto max-w-3xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant transition hover:text-primary"
        >
          <ArrowLeft size={17} />
          Customer Details
        </Link>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Customer Management
          </p>

          <h1 className="mt-1 font-display text-3xl text-on-surface">
            Edit Customer Details
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Update customer contact and default shipping information.
          </p>
        </div>

        <form
          id="customer-form"
          onSubmit={handleSubmit}
          className="mt-6 space-y-5"
        >
          <section className="rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Basic Information
            </p>

            <p className="mt-1 text-xs text-on-surface-variant">
              Customer identity and contact details.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-on-surface">
                  Full Name
                </span>

                <input
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3.5 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-on-surface">
                  Email Address
                </span>

                <input
                  value={customer.email}
                  readOnly
                  className="mt-2 w-full cursor-not-allowed rounded-xl border border-outline/20 bg-surface-container px-3.5 py-3 text-sm text-on-surface-variant outline-none"
                />

                <span className="mt-1.5 block text-xs text-on-surface-variant">
                  Email changes require customer identity verification.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-on-surface">
                  Phone Number
                </span>

                <input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="+60 12-345 6789"
                  className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3.5 py-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Shipping Address
            </p>

            <p className="mt-1 text-xs text-on-surface-variant">
              Customer&apos;s primary delivery address.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-on-surface">
                  Street Address
                </span>

                <input
                  value={form.street}
                  onChange={(event) => updateField("street", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3.5 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-semibold text-on-surface">
                    City
                  </span>

                  <input
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                    className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-on-surface">
                    State
                  </span>

                  <input
                    value={form.state}
                    onChange={(event) => updateField("state", event.target.value)}
                    className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-on-surface">
                    Postal Code
                  </span>

                  <input
                    value={form.postalCode}
                    onChange={(event) =>
                      updateField("postalCode", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-on-surface">
                    Country
                  </span>

                  <input
                    value={form.country}
                    onChange={(event) =>
                      updateField("country", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-outline/25 bg-surface-container-lowest px-3 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Account Status
            </p>

            <p className="mt-1 text-xs text-on-surface-variant">
              Active customers can place orders and access their account.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {["Active", "Inactive"].map((status) => {
                const isSelected = form.accountStatus === status;

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateField("accountStatus", status)}
                    className={
                      isSelected
                        ? "rounded-xl border-2 border-primary bg-surface-container p-3 text-left"
                        : "rounded-xl border border-outline/25 bg-surface-container-lowest p-3 text-left transition hover:bg-surface-container"
                    }
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      <span
                        className={
                          status === "Active"
                            ? "h-2.5 w-2.5 rounded-full bg-primary"
                            : "h-2.5 w-2.5 rounded-full bg-outline"
                        }
                      />
                      {status}
                    </span>

                    <span className="mt-1 block text-xs text-on-surface-variant">
                      {status === "Active"
                        ? "Can place orders"
                        : "Account access paused"}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 rounded-xl bg-surface-container-lowest p-3 text-xs leading-relaxed text-on-surface-variant">
              VIP, New, Returning, orders, total spent, and member since are
              system-calculated and cannot be edited here.
            </p>
          </section>
        </form>
      </div>

      <aside className="fixed bottom-0 left-0 right-0 z-30 border-t border-outline/20 bg-surface/95 px-5 py-3 backdrop-blur-xl lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href={backHref}
            className="flex h-12 flex-1 items-center justify-center rounded-xl border border-outline/25 bg-surface-container-lowest text-sm font-semibold text-on-surface transition hover:bg-surface-container"
          >
            Cancel
          </Link>

          <button
            form="customer-form"
            type="submit"
            className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90"
          >
            <Save size={17} />
            Save Changes
          </button>
        </div>
      </aside>
    </main>
  );
}