import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../../lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { GET } from "./route";

function client(options: { error?: unknown; recovery?: boolean; merchant?: boolean; store?: string; claimsError?: boolean } = {}) {
  const user = { id: "synthetic-user", user_metadata: { merchant_intent: options.merchant ?? false, signup_store: options.store } };
  const single = vi.fn().mockResolvedValue({ data: { is_platform_admin: false }, error: null });
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), limit: vi.fn(), single, maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  for (const fn of [chain.select, chain.eq, chain.in, chain.limit]) fn.mockReturnValue(chain);
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: options.error ? null : user, redirectType: options.recovery ? "recovery" : null }, error: options.error ?? null }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: user.id, session_id: "synthetic-session", exp: Date.now() / 1000 + 3600, amr: options.recovery ? [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] : [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: options.claimsError ? new Error("private token detail") : null }),
    },
    from: vi.fn().mockReturnValue(chain),
  };
}

describe("auth callback", () => {
  beforeEach(() => { mocks.createClient.mockReset(); });
  it("exchanges a confirmation code before redirecting to a safe destination", async () => {
    const supabase = client({ store: "synthetic-store" }); mocks.createClient.mockResolvedValue(supabase);
    const response = await GET(new Request("https://preview.example/auth/callback?code=synthetic-code"));
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("synthetic-code");
    expect(response.headers.get("location")).toBe("https://preview.example/store/synthetic-store");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("retains merchant onboarding after confirmation", async () => {
    mocks.createClient.mockResolvedValue(client({ merchant: true }));
    expect((await GET(new Request("https://preview.example/auth/callback?code=synthetic"))).headers.get("location")).toBe("https://preview.example/onboarding");
  });
  it("routes a verified recovery session to reset before role navigation", async () => {
    mocks.createClient.mockResolvedValue(client({ recovery: true, merchant: true }));
    const response = await GET(new Request("https://preview.example/auth/callback?code=synthetic&next=https://attacker.invalid"));
    expect(response.headers.get("location")).toBe("https://preview.example/reset-password");
  });
  it.each(["otp_expired", "invalid_grant", "flow_state_not_found", "bad_code_verifier"])("fails safely on %s without exposing provider details", async (code) => {
    mocks.createClient.mockResolvedValue(client({ error: { code, message: "token=DO-NOT-LOG" } }));
    const log = vi.spyOn(console, "error");
    const response = await GET(new Request("https://preview.example/auth/callback?code=DO-NOT-LOG&next=//attacker.invalid"));
    expect(response.headers.get("location")).toBe("https://preview.example/login?notice=auth-link-invalid");
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
    expect(await response.text()).not.toContain("DO-NOT-LOG");
  });
  it("does not accept a recovery routing hint when signed claims cannot be verified", async () => {
    mocks.createClient.mockResolvedValue(client({ recovery: true, claimsError: true }));
    expect((await GET(new Request("https://preview.example/auth/callback?code=synthetic"))).headers.get("location")).toBe("https://preview.example/login?notice=auth-link-invalid");
  });
  it("handles missing codes without contacting Auth", async () => {
    const response = await GET(new Request("https://preview.example/auth/callback?error_code=otp_expired"));
    expect(response.headers.get("location")).toBe("https://preview.example/login?notice=auth-link-invalid");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("does not allow user-editable continuation metadata to leave the origin", async () => {
    mocks.createClient.mockResolvedValue(client({ store: "//attacker.invalid" }));
    expect((await GET(new Request("https://preview.example/auth/callback?code=synthetic&next=//attacker.invalid"))).headers.get("location")).toBe("https://preview.example/");
  });
});
