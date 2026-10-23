import { describe, expect, it } from "vitest";
import { beginCheckoutAttempt, readCheckoutAttempt, clearCheckoutAttempt } from "./checkoutAttempt";
import type { GuestCheckoutRequest } from "./guestCheckout";

const request: GuestCheckoutRequest = { storeSlug: "synthetic", customerName: "Synthetic", customerEmail: "test@example.invalid", customerPhone: "000", addressLine1: "Do not ship", addressLine2: "", city: "Test", state: "Test", postalCode: "000", country: "Test", paymentMethodId: "test-method", items: [{productId:"test-product",quantity:1}] };
function storage() { const values = new Map<string,string>(); return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}}; }
describe("checkout attempt recovery", () => {
  it("retains the same key and original request after response loss and reload", () => {
    const s=storage(); const first=beginCheckoutAttempt(s,"synthetic",request);
    const restored=readCheckoutAttempt(s,"synthetic");
    expect(restored).toEqual(first);
    expect(beginCheckoutAttempt(s,"synthetic",request)).toEqual(first);
    expect(first.key).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not replace an unresolved attempt with changed details", () => {
    const s=storage(); const first=beginCheckoutAttempt(s,"synthetic",request);
    expect(()=>beginCheckoutAttempt(s,"synthetic",{...request,customerName:"Changed"})).toThrow(/Recover/);
    expect(readCheckoutAttempt(s,"synthetic")).toEqual(first);
  });
  it("isolates stores and starts a fresh attempt only after confirmed completion", () => {
    const s=storage(); const first=beginCheckoutAttempt(s,"synthetic",request);
    expect(readCheckoutAttempt(s,"another")).toBeNull();
    clearCheckoutAttempt(s,"synthetic",first.key);
    expect(beginCheckoutAttempt(s,"synthetic",request).key).not.toBe(first.key);
  });
  it("fails closed before submitting if durable session storage is unavailable", () => {
    const s={...storage(),setItem:()=>{throw new Error("quota");}};
    expect(()=>beginCheckoutAttempt(s,"synthetic",request)).toThrow(/save/);
  });
  it("rejects corrupt saved attempts rather than silently replacing their key", () => {
    const s=storage(); s.setItem("lumina-checkout-attempt:synthetic","broken");
    expect(()=>readCheckoutAttempt(s,"synthetic")).toThrow(/saved checkout/);
  });
  it("does not clear a newer attempt when an older response arrives", () => {
    const s=storage(); const first=beginCheckoutAttempt(s,"synthetic",request);
    clearCheckoutAttempt(s,"synthetic","0".repeat(64));
    expect(readCheckoutAttempt(s,"synthetic")).toEqual(first);
  });
});
