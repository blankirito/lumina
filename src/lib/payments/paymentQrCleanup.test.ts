import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeId = "11111111-1111-4111-8111-111111111111";
const methodId = "22222222-2222-4222-8222-222222222222";
const ownPath = `stores/${storeId}/payment-methods/${methodId}/33333333-3333-4333-8333-333333333333.png`;
type Job = { id: string; storage_path: string; attempts: number; store_id: string | null; payment_method_id: string | null };
const state = vi.hoisted(() => ({
  jobs: [] as Job[],
  removed: [] as string[],
  deleted: [] as string[],
  updates: [] as Record<string, unknown>[],
  removeError: null as null | { message: string },
  persistenceError: null as null | { message: string },
  excludeNull: [] as string[],
}));

vi.mock("@/lib/payments/paymentQrCode", () => import("./paymentQrCode"));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ remove: async (paths: string[]) => {
      state.removed.push(...paths);
      return { error: state.removeError };
    } }) },
    from: () => {
      let deleting = false;
      const query = {
        select: () => query,
        not: (column: string) => { state.excludeNull.push(column); return query; },
        order: () => query,
        // Return malformed rows too, to verify the worker's final deletion guard.
        limit: async () => ({ data: state.jobs, error: null }),
        delete: () => { deleting = true; return query; },
        update: (data: Record<string, unknown>) => { state.updates.push(data); return query; },
        eq: async (_column: string, id: string) => {
          if (state.persistenceError) return { error: state.persistenceError };
          if (deleting) state.deleted.push(id);
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

import { GET } from "../../app/api/cron/route";

async function runCleanup() {
  return GET(new Request("https://example.test/api/cron", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
}

describe("payment QR cleanup provenance", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    state.jobs = [{ id: "job-1", storage_path: ownPath, attempts: 0, store_id: storeId, payment_method_id: methodId }];
    state.removed = [];
    state.deleted = [];
    state.updates = [];
    state.excludeNull = [];
    state.removeError = null;
    state.persistenceError = null;
  });

  it("leaves legacy jobs without authorization provenance untouched", async () => {
    state.jobs[0].store_id = null;
    state.jobs[0].payment_method_id = null;
    const response = await runCleanup();
    expect(state.removed).toEqual([]);
    expect(state.deleted).toEqual([]);
    expect(state.updates).toEqual([]);
    expect(await response.json()).toMatchObject({ removed: 0, skipped: 1 });
  });

  it.each([
    ownPath.replace(storeId, "44444444-4444-4444-8444-444444444444"),
    ownPath.replace(methodId, "44444444-4444-4444-8444-444444444444"),
    ownPath.replace("33333333", "../33333333"),
    ownPath.replace("33333333", "%2e%2e%2f33333333"),
  ])("never removes a queued path outside its authorized scope: %s", async (path) => {
    state.jobs[0].storage_path = path;
    await runCleanup();
    expect(state.removed).toEqual([]);
    expect(state.deleted).toEqual([]);
  });

  it("removes a scoped image and completes its retry job", async () => {
    const response = await runCleanup();
    expect(state.removed).toEqual([ownPath]);
    expect(state.deleted).toEqual(["job-1"]);
    expect(await response.json()).toMatchObject({ removed: 1, failed: 0 });
  });

  it("keeps a scoped job retryable after a storage failure", async () => {
    state.removeError = { message: "Temporary failure" };
    state.jobs[0].attempts = 2;
    await runCleanup();
    expect(state.removed).toEqual([ownPath]);
    expect(state.deleted).toEqual([]);
    expect(state.updates).toEqual([{ attempts: 3, last_error: "Temporary failure" }]);
  });

  it("excludes legacy jobs before applying the batch limit so retries are not starved", async () => {
    await runCleanup();
    expect(state.excludeNull).toEqual(["store_id", "payment_method_id"]);
  });

  it("reports queue acknowledgement failure and can finish on retry", async () => {
    state.persistenceError = { message: "Private database failure" };
    const failed = await runCleanup();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ removed: 0, failed: 1 });
    expect(state.deleted).toEqual([]);
    state.persistenceError = null;
    const recovered = await runCleanup();
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ removed: 1, failed: 0 });
    expect(state.deleted).toEqual(["job-1"]);
  });

  it("reports storage failure and failed retry bookkeeping without leaking details", async () => {
    state.removeError = { message: "Private storage failure" };
    state.persistenceError = { message: "Private database failure" };
    const response = await runCleanup();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Private");
    expect(state.deleted).toEqual([]);
  });

  it("fails the run when storage removal fails even if bookkeeping succeeds", async () => {
    state.removeError = { message: "Temporary storage failure" };
    const response = await runCleanup();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ removed: 0, failed: 1 });
  });
});
