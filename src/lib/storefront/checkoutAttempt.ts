import { prepareGuestCheckoutRequest, type GuestCheckoutRequest } from "./guestCheckout";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type CheckoutAttempt = { key: string; request: GuestCheckoutRequest };
const storageKey = (store: string) => `lumina-checkout-attempt:${store}`;

export function readCheckoutAttempt(storage: Storage, store: string): CheckoutAttempt | null {
  try {
    const raw = storage.getItem(storageKey(store));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutAttempt;
    if (!/^[a-f0-9]{64}$/.test(parsed.key) || parsed.request?.storeSlug !== store) throw new Error();
    return { key: parsed.key, request: prepareGuestCheckoutRequest(parsed.request) };
  } catch {
    throw new Error("Cannot read the saved checkout. Do not place another order; contact the store for help.");
  }
}

export function beginCheckoutAttempt(storage: Storage, store: string, request: GuestCheckoutRequest): CheckoutAttempt {
  const pending = readCheckoutAttempt(storage, store);
  if (pending) {
    if (JSON.stringify(pending.request) !== JSON.stringify(request)) {
      throw new Error("Recover your pending checkout before changing order details.");
    }
    return pending;
  }
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const attempt = { key, request };
  try {
    storage.setItem(storageKey(store), JSON.stringify(attempt));
    if (storage.getItem(storageKey(store)) !== JSON.stringify(attempt)) throw new Error();
  } catch {
    throw new Error("Cannot safely save this checkout. Enable browser session storage before placing an order.");
  }
  return attempt;
}

export function clearCheckoutAttempt(storage: Storage, store: string, key: string) {
  if (readCheckoutAttempt(storage, store)?.key === key) storage.removeItem(storageKey(store));
}
