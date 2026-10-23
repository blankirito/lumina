import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { resetPassword } from "./actions";

describe("password reset server action", () => {
  beforeEach(() => { mocks.createClient.mockReset(); });
  function auth(recovery: boolean, identityError = false) {
    return {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: identityError ? new Error("private") : null }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "synthetic-user", session_id: "synthetic-session", exp: Date.now() / 1000 + 3600, amr: [{ method: recovery ? "recovery" : "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    };
  }
  it("rejects ordinary authenticated sessions even when posted directly", async () => {
    const client = { auth: auth(false) }; mocks.createClient.mockResolvedValue(client);
    expect((await resetPassword("Synthetic!234", "Synthetic!234")).status).toBe("invalid-link");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it("rejects an invalid user even when local claims look like recovery", async () => {
    const client = { auth: auth(true, true) }; mocks.createClient.mockResolvedValue(client);
    expect((await resetPassword("Synthetic!234", "Synthetic!234")).status).toBe("invalid-link");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it("updates only the verified session's user and revokes all refresh sessions", async () => {
    const client = { auth: auth(true) }; mocks.createClient.mockResolvedValue(client);
    expect((await resetPassword("Synthetic!234", "Synthetic!234")).status).toBe("success");
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "Synthetic!234" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("contains exceptions without exposing credentials or provider details", async () => {
    mocks.createClient.mockRejectedValue(new Error("private-cookie-value"));
    const result = await resetPassword("Synthetic!234", "Synthetic!234");
    expect(result.status).not.toBe("success");
    expect(JSON.stringify(result)).not.toMatch(/private-cookie-value|Synthetic!234/);
  });
});
