import { beforeEach, describe, expect, it, vi } from "vitest";

const storeId = "11111111-1111-4111-8111-111111111111";
const methodId = "22222222-2222-4222-8222-222222222222";
const imageName = "33333333-3333-4333-8333-333333333333.png";
const ownPath = `stores/${storeId}/payment-methods/${methodId}/${imageName}`;
const state = vi.hoisted(() => ({
  path: "",
  removeError: null as null | { message: string },
  updateError: false,
  removed: [] as string[],
  queued: [] as Record<string, unknown>[],
  uploaded: [] as string[],
}));

// Only external authentication, database, storage and cache boundaries are faked.
// Payment validation and the Server Action execute their real implementations.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/products/adminStore", () => import("../products/adminStore"));
vi.mock("@/lib/payments/newStorePaymentMethod", () => import("./newStorePaymentMethod"));
vi.mock("@/lib/payments/paymentQrCode", () => import("./paymentQrCode"));
vi.mock("@/lib/payments/paymentQrChange", () => import("./paymentQrChange"));
vi.mock("@/lib/payments/storePaymentMethodUpdate", () => import("./storePaymentMethodUpdate"));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: (table: string) => {
      let updating = false;
      const query = {
        select: () => query,
        eq: () => query,
        in: async () => ({ data: [{ store_id: "11111111-1111-4111-8111-111111111111", role: "owner" }], error: null }),
        update: () => { updating = true; return query; },
        maybeSingle: async () => {
          if (table !== "store_payment_methods") throw new Error("Unexpected table");
          return updating
            ? { data: state.updateError ? null : { id: "22222222-2222-4222-8222-222222222222" }, error: state.updateError ? { message: "failed" } : null }
            : { data: { id: "22222222-2222-4222-8222-222222222222", qr_image_path: state.path }, error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({
      upload: async (path: string) => {
        state.uploaded.push(path);
        return { error: null };
      },
      remove: async (paths: string[]) => {
        state.removed.push(...paths);
        return { error: state.removeError };
      },
    }) },
    from: (table: string) => ({
      upsert: async (job: Record<string, unknown>) => {
        if (table !== "payment_qr_cleanup_jobs") throw new Error("Unexpected table");
        state.queued.push(job);
        return { error: null };
      },
    }),
  }),
}));

import { updateStorePaymentMethod } from "../../app/admin/settings/payments/actions";

function removalInput() {
  const input = new FormData();
  input.set("paymentMethodId", methodId);
  input.set("label", "Bank transfer");
  input.set("instructions", "Scan QR");
  input.set("isEnabled", "true");
  input.set("removeQr", "true");
  return input;
}

function replacementInput() {
  const input = removalInput();
  input.set("removeQr", "false");
  input.set("qrImage", new File([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ], "qr.png", { type: "image/png" }));
  return input;
}

describe("payment QR deletion authorization", () => {
  beforeEach(() => {
    state.path = ownPath;
    state.removeError = null;
    state.updateError = false;
    state.removed = [];
    state.queued = [];
    state.uploaded = [];
  });

  it.each([
    `stores/44444444-4444-4444-8444-444444444444/payment-methods/${methodId}/${imageName}`,
    `stores/${storeId}/payment-methods/44444444-4444-4444-8444-444444444444/${imageName}`,
    `stores/${storeId}/payment-methods/${methodId}/../${imageName}`,
    `stores/${storeId}/payment-methods/${methodId}/%2e%2e%2f${imageName}`,
    `stores/${storeId}/payment-methods/${methodId}/%252e%252e%252f${imageName}`,
    `stores/${storeId}/payment-methods/${methodId}/..\\${imageName}`,
    `${ownPath}?other=image`,
    `${ownPath}\n`,
  ])("never deletes or queues an untrusted stored path: %s", async (path) => {
    state.path = path;
    state.removeError = { message: "Storage temporarily unavailable" };
    expect(await updateStorePaymentMethod(removalInput())).toEqual({ paymentMethodId: methodId });
    expect(state.removed).toEqual([]);
    expect(state.queued).toEqual([]);
  });

  it("removes a legitimate image owned by the authorized store and method", async () => {
    await updateStorePaymentMethod(removalInput());
    expect(state.removed).toEqual([ownPath]);
    expect(state.queued).toEqual([]);
  });

  it("records the authorized scope when a legitimate deletion needs retrying", async () => {
    state.removeError = { message: "Storage temporarily unavailable" };
    await updateStorePaymentMethod(removalInput());
    expect(state.queued).toEqual([{
      storage_path: ownPath,
      store_id: storeId,
      payment_method_id: methodId,
      last_error: "Storage temporarily unavailable",
    }]);
  });

  it("replaces a poisoned reference without deleting or queueing the victim image", async () => {
    state.path = ownPath.replace(storeId, "44444444-4444-4444-8444-444444444444");
    state.removeError = { message: "Temporary failure" };
    expect(await updateStorePaymentMethod(replacementInput())).toEqual({ paymentMethodId: methodId });
    expect(state.uploaded).toHaveLength(1);
    expect(state.removed).toEqual([]);
    expect(state.queued).toEqual([]);
  });

  it("cleans up only the fresh own upload when saving the replacement fails", async () => {
    state.path = ownPath.replace(storeId, "44444444-4444-4444-8444-444444444444");
    state.updateError = true;
    expect(await updateStorePaymentMethod(replacementInput())).toHaveProperty("error");
    expect(state.uploaded).toHaveLength(1);
    expect(state.removed).toEqual(state.uploaded);
    expect(state.removed[0]).toMatch(new RegExp(`^stores/${storeId}/payment-methods/${methodId}/`));
    expect(state.queued).toEqual([]);
  });
});
