"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, CheckCircle2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  toStorefrontProduct,
  type DatabaseStorefrontProduct,
  type StorefrontProduct,
} from "@/lib/storefront/storefrontProduct";
import { getPublicProductImageUrl } from "@/lib/products/productImageUrl";
import {
  prepareGuestCheckoutRequest,
} from "@/lib/storefront/guestCheckout";
import type { StorefrontPaymentMethod } from "@/lib/storefront/getPublicStorefront";
import { toStorefrontCartView } from "@/lib/storefront/storefrontCartView";
import { useStorefrontCart } from "./StorefrontCartProvider";
import type { StorefrontSavedAddress } from "@/lib/storefront/storefrontAddresses";
import { submitGuestCheckout } from "@/app/store/[slug]/checkout/actions";
import { getStorefrontPaymentQrView } from "@/lib/storefront/storefrontPaymentQr";
import { getGuestTrackingLink } from "@/lib/storefront/guestTrackingLink";
import { beginCheckoutAttempt, clearCheckoutAttempt, readCheckoutAttempt, type CheckoutAttempt } from "@/lib/storefront/checkoutAttempt";

const subscribeAttempts = (listener: () => void) => {
  window.addEventListener("lumina-checkout-attempt", listener);
  return () => window.removeEventListener("lumina-checkout-attempt", listener);
};
const emptyAttempt = () => null;

type StorefrontCheckoutPageProps = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  customerEmail: string;
  paymentMethods: StorefrontPaymentMethod[];
  preferredPaymentMethodId: string | null;
  savedAddresses: StorefrontSavedAddress[];
  defaultAddressId: string | null;
  recoveryOnly?: boolean;
};

type CheckoutSuccess = {
  order_id: string;
  order_number: string;
  tracking_token: string;
  payment_method_label: string;
  payment_instructions: string;
  replayed: boolean;
  paymentQrImageUrl: string | null;
  paymentQrGuidance: string | null;
};

export default function StorefrontCheckoutPage({
  storeId,
  storeName,
  storeSlug,
  customerEmail,
  paymentMethods,
  preferredPaymentMethodId,
  savedAddresses,
  defaultAddressId,
  recoveryOnly = false,
}: StorefrontCheckoutPageProps) {
  const { items, isReady, updateQuantity } = useStorefrontCart();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);
  const [trackingCopyMessage, setTrackingCopyMessage] = useState("");
  const submitting = useRef(false);
  const savedAttempt = useSyncExternalStore(subscribeAttempts, () => {
    try { return window.sessionStorage.getItem(`lumina-checkout-attempt:${storeSlug}`); }
    catch { return "unavailable"; }
  }, emptyAttempt);
  const initialPaymentMethodId =
    preferredPaymentMethodId &&
      paymentMethods.some(
        (paymentMethod) =>
          paymentMethod.id === preferredPaymentMethodId,
      )
      ? preferredPaymentMethodId
      : paymentMethods[0]?.id ?? "";

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(
    initialPaymentMethodId,
  );
  const initialAddress =
    savedAddresses.find((address) => address.id === defaultAddressId) ?? null;

  const [selectedAddressId, setSelectedAddressId] = useState(
    initialAddress?.id ?? "",
  );

  const [isAddressPickerOpen, setIsAddressPickerOpen] = useState(false);

  const selectedAddress =
    savedAddresses.find((address) => address.id === selectedAddressId) ?? null;

  const selectedPaymentMethod =
    paymentMethods.find(
      (paymentMethod) => paymentMethod.id === selectedPaymentMethodId,
    ) ?? null;

  const selectedPaymentQr =
    selectedPaymentMethod && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? getStorefrontPaymentQrView({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        qrImagePath: selectedPaymentMethod.qrImagePath,
      })
      : null;

  const [form, setForm] = useState({
    customerName: initialAddress?.recipientName ?? "",
    customerEmail,
    customerPhone: initialAddress?.phone ?? "",
    addressLine1: initialAddress?.addressLine1 ?? "",
    addressLine2: initialAddress?.addressLine2 ?? "",
    city: initialAddress?.city ?? "",
    state: initialAddress?.state ?? "",
    postalCode: initialAddress?.postalCode ?? "",
    country: initialAddress?.country ?? "Malaysia",
  });

  const cartItems = useMemo(
    () => items.filter((item) => item.storeSlug === storeSlug),
    [items, storeSlug],
  );

  const request = useMemo(
    () => ({ storeId, isReady, cartItems }),
    [storeId, isReady, cartItems],
  );
  const [loadedProducts, setLoadedProducts] = useState<{
    request: typeof request;
    products: StorefrontProduct[];
  } | null>(null);
  const hasProducts = cartItems.length > 0;
  const products = useMemo(
    () => hasProducts && loadedProducts?.request === request
      ? loadedProducts.products
      : [],
    [hasProducts, loadedProducts, request],
  );
  const isLoadingProducts = !isReady || (hasProducts && loadedProducts?.request !== request);

  useEffect(() => {
    if (!request.storeId || !request.isReady || request.cartItems.length === 0) return;
    let isCurrent = true;

    async function loadProducts() {
      const { data } = await createClient()
        .from("products")
        .select(`
          id,
          store_id,
          slug,
          name,
          description,
          category,
          price,
          stock,
          rating,
          review_count,
          is_new,
          product_images (
            storage_path,
            alt_text,
            sort_order,
            is_primary
          )
        `)
        .eq("store_id", request.storeId)
        .eq("is_active", true)
        .in("id", request.cartItems.map((item) => item.productId));

      if (isCurrent) {
        setLoadedProducts({
          request,
          products: (data ?? []).map((product) =>
            toStorefrontProduct(product as DatabaseStorefrontProduct),
          ),
        });
      }
    }

    void loadProducts();
    return () => {
      isCurrent = false;
  };
  }, [request]);

  const viewItems = toStorefrontCartView(cartItems, products);

  const subtotal = viewItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  function updateFormField(
    field: keyof typeof form,
    value: string,
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function applySavedAddress(address: StorefrontSavedAddress) {
    setSelectedAddressId(address.id);

    setForm((current) => ({
      ...current,
      customerName: address.recipientName,
      customerPhone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    }));

    setIsAddressPickerOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    try {
      setErrorMessage(null);

      const request = prepareGuestCheckoutRequest({
        storeSlug,
        ...form,
        paymentMethodId: selectedPaymentMethodId,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      const attempt = beginCheckoutAttempt(window.sessionStorage, storeSlug, request);
      window.dispatchEvent(new Event("lumina-checkout-attempt"));
      await sendAttempt(attempt);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not place your order.",
      );
    }
  }

  async function sendAttempt(attempt: CheckoutAttempt) {
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await submitGuestCheckout(attempt.request, attempt.key);
      if (result.status === "error") {
        if (!result.retryable) {
          clearCheckoutAttempt(window.sessionStorage, storeSlug, attempt.key);
          window.dispatchEvent(new Event("lumina-checkout-attempt"));
        }
        setErrorMessage(result.message);
        return;
      }
      // Record success before best-effort cart/storage cleanup. Neither a
      // storage exception nor a lost response may start a new checkout key.
      setSuccess({ ...result.order, paymentQrImageUrl: selectedPaymentQr?.imageUrl ?? null, paymentQrGuidance: selectedPaymentQr?.guidance ?? null });
      try {
        attempt.request.items.forEach(item => updateQuantity(storeSlug, item.productId, 0));
        // Keep the recovery key until the customer explicitly leaves to start
        // another order. A refresh after successful checkout stays recoverable.
      } catch { /* Retained attempt remains safe to recover on a refresh. */ }
    } catch {
      setErrorMessage("Your checkout result could not be confirmed. Use Recover checkout to safely check the same order.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  async function recoverCheckout() {
    try {
      const attempt = readCheckoutAttempt(window.sessionStorage, storeSlug);
      if (attempt) await sendAttempt(attempt);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Cannot recover the saved checkout. Contact the store before ordering again.");
    }
  }

  async function handleCopyTrackingLink(trackingLink: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${trackingLink}`,
      );
      setTrackingCopyMessage(
        "Tracking link copied. Keep it private and save it somewhere safe.",
      );

      window.setTimeout(() => {
        setTrackingCopyMessage("");
      }, 3000);
    } catch {
      setTrackingCopyMessage(
        "Could not copy the tracking link. Please use Track this order instead.",
      );
    }
  }

  if (!recoveryOnly && !savedAttempt && (!isReady || isLoadingProducts)) {
    return (
      <main className="min-h-screen bg-background px-5 py-6">
        <div className="h-8 w-44 animate-pulse rounded bg-surface-low" />
      </main>
    );
  }

  if (success) {
    const trackingLink = getGuestTrackingLink(
      storeSlug,
      success.order_number,
      success.tracking_token,
    );

    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <section className="mx-auto max-w-lg rounded-2xl bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
            <CheckCircle2 size={30} />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            {storeName}
          </p>

          <h1 className="mt-2 font-display text-3xl text-primary">
            {success.replayed ? "Checkout recovered" : "Order placed"}
          </h1>

          <p className="mt-3 text-on-surface-variant">
            Thank you. Your order reference is:
          </p>

          <p className="mt-2 font-display text-2xl text-primary">
            {success.order_number}
          </p>

          {success.replayed ? <p className="mt-6 text-on-surface-variant">This is your original order. Check its current status through Track this order before making any payment.</p> : <div className="mt-6 rounded-xl bg-surface-low p-5 text-left">
            <p className="font-semibold text-primary">
              {success.payment_method_label}
            </p>

            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              {success.payment_instructions ||
                "The store will contact you with payment instructions."}
            </p>
          </div>}

          {!success.replayed && success.paymentQrImageUrl && (
            <div className="mt-4 rounded-xl border border-outline/40 bg-surface-low p-4 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={success.paymentQrImageUrl}
                alt={`${success.payment_method_label} payment QR code`}
                className="mx-auto max-h-72 w-full rounded-lg object-contain"
              />

              {success.paymentQrGuidance && (
                <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                  {success.paymentQrGuidance}
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            <p className="mb-3 text-sm leading-relaxed text-on-surface-variant">
              This private tracking link is the only way for a guest to view this
              order later. Save it somewhere safe and do not share it.
            </p>

            <div className="flex flex-col gap-3">
              <a
                href={trackingLink}
                className="inline-flex w-full items-center justify-center rounded-2xl border-2 border-[#915747] px-5 py-3 font-semibold text-[#915747]"
              >
                Track this order
              </a>

              <button
                type="button"
                onClick={() => void handleCopyTrackingLink(trackingLink)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-outline px-5 py-3 text-sm font-semibold text-primary transition hover:bg-surface-low"
              >
                Copy tracking link
              </button>

              <Link
                href={`/store/${storeSlug}`}
                onClick={(event) => {
                  try {
                    const attempt = readCheckoutAttempt(window.sessionStorage, storeSlug);
                    if (attempt) clearCheckoutAttempt(window.sessionStorage, storeSlug, attempt.key);
                    window.dispatchEvent(new Event("lumina-checkout-attempt"));
                  } catch {
                    event.preventDefault();
                    setTrackingCopyMessage("Could not clear the saved checkout. Keep your tracking link and contact the store before ordering again.");
                  }
                }}
                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"
              >
                Back to store — start a new order
              </Link>
            </div>

            {trackingCopyMessage && (
              <p
                role="status"
                className="mt-3 rounded-lg bg-primary-container/25 px-3 py-2 text-sm leading-relaxed text-on-primary-container"
              >
                {trackingCopyMessage}
              </p>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (savedAttempt) {
    return <main className="min-h-screen bg-background px-5 py-12 text-center">
      <h1 className="font-display text-3xl text-primary">Recover checkout</h1>
      <p className="mx-auto mt-4 max-w-lg">A checkout is awaiting confirmation in this browser tab. Recover it before placing another order or changing its details. Recovery uses the original request and does not reserve stock twice.</p>
      <button type="button" disabled={isSubmitting} onClick={() => void recoverCheckout()} className="mt-6 rounded-xl bg-primary px-6 py-3 text-white disabled:opacity-50">{isSubmitting ? "Checking order…" : "Recover checkout"}</button>
      {errorMessage ? <p role="alert" className="mt-4">{errorMessage}</p> : null}
    </main>;
  }

  if (recoveryOnly) {
    return <main className="min-h-screen bg-background px-5 py-12 text-center"><h1 className="font-display text-3xl text-primary">Store unavailable</h1><p className="mt-4">If a checkout is saved in this browser tab, its recovery option will appear here. Otherwise contact the store about an existing order.</p></main>;
  }

  if (viewItems.length === 0) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="font-display text-3xl text-primary">
          Your cart is empty
        </h1>

        <Link
          href={`/store/${storeSlug}`}
          className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"
        >
          Continue Shopping
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-12">
      <header className="flex h-16 items-center border-b border-outline bg-surface px-5">
        <Link
          href={`/store/${storeSlug}/cart`}
          aria-label="Back to cart"
          className="flex h-10 w-10 items-center justify-center rounded-full text-primary"
        >
          <ArrowLeft size={22} />
        </Link>

        <h1 className="mx-auto font-display text-xl text-primary">
          Checkout
        </h1>

        <div className="h-10 w-10" />
      </header>

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-lg space-y-6 px-5 py-6"
      >
        <section className="rounded-2xl bg-surface p-6 shadow-sm">
          <h2 className="font-display text-xl text-primary">
            Contact information
          </h2>

          <div className="mt-4 grid gap-3">
            <input
              value={form.customerName}
              onChange={(event) =>
                updateFormField("customerName", event.target.value)
              }
              placeholder="Full name"
              className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
            />

            <input
              value={form.customerEmail}
              onChange={(event) =>
                updateFormField("customerEmail", event.target.value)
              }
              type="email"
              placeholder="Email address"
              className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
            />

            <input
              value={form.customerPhone}
              onChange={(event) =>
                updateFormField("customerPhone", event.target.value)
              }
              type="tel"
              placeholder="Phone number"
              className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl text-primary">
              Delivery address
            </h2>

            {savedAddresses.length > 0 && (
              <button
                type="button"
                onClick={() => setIsAddressPickerOpen((current) => !current)}
                className="text-sm font-semibold text-primary"
              >
                {isAddressPickerOpen ? "Done" : "Change"}
              </button>
            )}
          </div>

          {selectedAddress && (
            <div className="mt-4 rounded-xl bg-primary-fixed/50 p-4">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-primary" />

                <div className="text-sm leading-6 text-on-surface-variant">
                  <p className="font-semibold text-primary">
                    {selectedAddress.label}
                    {selectedAddress.isDefault ? " · Default" : ""}
                  </p>
                  <p>
                    {selectedAddress.recipientName} · {selectedAddress.phone}
                  </p>
                  <p>{selectedAddress.addressLine1}</p>
                  <p>
                    {selectedAddress.city}, {selectedAddress.state}{" "}
                    {selectedAddress.postalCode}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAddressPickerOpen && (
            <div className="mt-4 space-y-2">
              {savedAddresses.map((address) => (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => applySavedAddress(address)}
                  className={`w-full rounded-xl border p-4 text-left transition ${selectedAddressId === address.id
                    ? "border-primary bg-primary/5"
                    : "border-outline/30 bg-surface-low hover:border-primary/50"
                    }`}
                >
                  <p className="font-semibold text-primary">
                    {address.label}
                    {address.isDefault ? " · Default" : ""}
                  </p>

                  <p className="mt-1 text-sm text-on-surface-variant">
                    {address.recipientName} · {address.phone}
                  </p>

                  <p className="mt-1 text-sm text-on-surface-variant">
                    {address.addressLine1}, {address.city}
                  </p>
                </button>
              ))}

              <p className="px-1 text-xs leading-5 text-on-surface-variant">
                You can still edit the fields below for this order only.
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-3">
            <input
              value={form.addressLine1}
              onChange={(event) =>
                updateFormField("addressLine1", event.target.value)
              }
              placeholder="Address line 1"
              className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
            />

            <input
              value={form.addressLine2}
              onChange={(event) =>
                updateFormField("addressLine2", event.target.value)
              }
              placeholder="Address line 2 (optional)"
              className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.city}
                onChange={(event) =>
                  updateFormField("city", event.target.value)
                }
                placeholder="City"
                className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
              />

              <input
                value={form.state}
                onChange={(event) =>
                  updateFormField("state", event.target.value)
                }
                placeholder="State"
                className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.postalCode}
                onChange={(event) =>
                  updateFormField("postalCode", event.target.value)
                }
                placeholder="Postal code"
                className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
              />

              <input
                value={form.country}
                onChange={(event) =>
                  updateFormField("country", event.target.value)
                }
                placeholder="Country"
                className="rounded-xl border border-transparent bg-surface-low px-4 py-3 outline-none transition focus:border-primary"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-surface p-6 shadow-sm">
          <h2 className="font-display text-xl text-primary">
            Payment method
          </h2>

          <div className="mt-4 space-y-3">
            {paymentMethods.map((paymentMethod) => (
              <label
                key={paymentMethod.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline/70 bg-background p-4 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={paymentMethod.id}
                  checked={selectedPaymentMethodId === paymentMethod.id}
                  onChange={() =>
                    setSelectedPaymentMethodId(paymentMethod.id)
                  }
                  className="mt-1 accent-primary"
                />

                <span>
                  <span className="block font-semibold text-primary">
                    {paymentMethod.label}
                  </span>

                  {paymentMethod.instructions && (
                    <span className="mt-1 block text-sm text-on-surface-variant">
                      {paymentMethod.instructions}
                    </span>
                  )}
                  {selectedPaymentMethodId === paymentMethod.id && selectedPaymentQr && (
                    <span className="mt-4 block rounded-xl border border-outline/40 bg-surface-low p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPaymentQr.imageUrl}
                        alt={`${paymentMethod.label} payment QR code`}
                        className="mx-auto max-h-72 w-full rounded-lg object-contain"
                      />

                      <span className="mt-3 block text-sm leading-relaxed text-on-surface-variant">
                        {selectedPaymentQr.guidance}
                      </span>
                    </span>
                  )}
                </span>
              </label>
            ))}

            {paymentMethods.length === 0 && (
              <p className="rounded-xl bg-error-container p-4 text-sm text-error">
                This store has no payment method available yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-surface-low p-6">
          <h2 className="font-display text-xl text-primary">
            Order summary
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            {viewItems.map(({ product, quantity }) => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-4 border-b border-outline/30 pb-3 text-on-surface-variant last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                    {product.imagePath && process.env.NEXT_PUBLIC_SUPABASE_URL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPublicProductImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, product.imagePath)}
                        alt={product.imageAlt ?? product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="truncate">
                    {product.name} × {quantity}
                  </span>
                </div>

                <span className="shrink-0">RM{(product.price * quantity).toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between border-t border-outline pt-4 font-semibold text-primary">
              <span>Total</span>
              <span>RM{subtotal.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {errorMessage && (
          <p className="rounded-xl bg-error-container p-4 text-sm text-error">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || paymentMethods.length === 0}
          className="w-full rounded-full bg-primary py-4 text-lg font-semibold text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-outline"
        >
          {isSubmitting
            ? "Placing order..."
            : `Place Order · RM${subtotal.toFixed(2)}`}
        </button>
      </form>
    </main>
  );
}
