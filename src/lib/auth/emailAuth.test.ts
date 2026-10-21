import { describe, expect, it, vi } from "vitest";
import { getEmailAuthRedirect, hasRecentRecovery, prepareResetPassword, requestPasswordRecovery, completePasswordRecovery } from "./emailAuth";

describe("email authentication", () => {
  it("routes email confirmation and recovery to the allowlisted exchange endpoint", () => {
    expect(getEmailAuthRedirect("https://preview.example")).toBe("https://preview.example/auth/callback");
  });
  const now = 1_800_000_000;
  const claims = { sub: "test-user", session_id: "session", exp: now + 3600, amr: [{ method: "recovery", timestamp: now - 10 }] };
  it("accepts only a recent verified recovery identity", () => {
    expect(hasRecentRecovery(claims, "test-user", now)).toBe(true);
    expect(hasRecentRecovery(claims, "other-user", now)).toBe(false);
    expect(hasRecentRecovery({ ...claims, exp: now }, "test-user", now)).toBe(false);
    expect(hasRecentRecovery({ ...claims, session_id: "" }, "test-user", now)).toBe(false);
  });
  it("tolerates small clock differences between verified Auth claims and the app server", () => {
    expect(hasRecentRecovery({ ...claims, amr: [{ method: "recovery", timestamp: now + 1 }] }, "test-user", now)).toBe(true);
    expect(hasRecentRecovery({ ...claims, amr: [{ method: "recovery", timestamp: now + 30 }] }, "test-user", now)).toBe(true);
  });
  it.each([undefined, [], ["recovery"], [{ method: "password", timestamp: now }], [{ method: "recovery", timestamp: now - 901 }], [{ method: "recovery", timestamp: now + 31 }]])("rejects absent, ordinary, stale or malformed recovery evidence: %j", (amr) => {
    expect(hasRecentRecovery({ ...claims, amr }, "test-user", now)).toBe(false);
  });
  it("does not accept recovery claims placed in user-editable metadata", () => {
    expect(hasRecentRecovery({ ...claims, amr: [], user_metadata: { amr: claims.amr } }, "test-user", now)).toBe(false);
  });
  it("validates the new password before attempting any credential change", () => {
    expect(prepareResetPassword("Synthetic!234", "Synthetic!234")).toBe("Synthetic!234");
    for (const [password, confirmation] of [["short", "short"], ["no-number!", "no-number!"], ["NoSymbol123", "NoSymbol123"], ["Synthetic!234", "different"]]) {
      expect(() => prepareResetPassword(password, confirmation)).toThrow();
    }
  });
  it("does not reveal account existence or provider error details", async () => {
    const send = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "private account details" } }).mockRejectedValueOnce(new Error("secret-provider-detail"));
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await requestPasswordRecovery(send, " test@example.invalid ", "https://preview.example"));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).not.toMatch(/private|secret-provider-detail/);
    expect(send).toHaveBeenCalledWith("test@example.invalid", { redirectTo: "https://preview.example/auth/callback" });
  });
  it("fails closed without valid recovery evidence and never changes the password", async () => {
    const update = vi.fn(); const signOut = vi.fn();
    const result = await completePasswordRecovery({ claims: { ...claims, amr: [] }, userId: "test-user", password: "Synthetic!234", confirmation: "Synthetic!234", now, update, signOut });
    expect(result.status).toBe("invalid-link"); expect(update).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled();
  });
  it("changes the password then revokes refresh sessions, without returning credentials", async () => {
    const sequence: string[] = [];
    const update = vi.fn(async () => { sequence.push("update"); return { error: null }; });
    const signOut = vi.fn(async () => { sequence.push("signout"); return { error: null }; });
    const result = await completePasswordRecovery({ claims, userId: "test-user", password: "Synthetic!234", confirmation: "Synthetic!234", now, update, signOut });
    expect(result.status).toBe("success"); expect(sequence).toEqual(["update", "signout"]);
    expect(update).toHaveBeenCalledWith({ password: "Synthetic!234" });
    expect(JSON.stringify(result)).not.toContain("Synthetic!234");
  });
  it("does not claim success or leak raw errors when password update fails", async () => {
    const signOut = vi.fn();
    const result = await completePasswordRecovery({ claims, userId: "test-user", password: "Synthetic!234", confirmation: "Synthetic!234", now, update: async () => ({ error: { message: "token=private" } }), signOut });
    expect(result.status).toBe("error"); expect(JSON.stringify(result)).not.toContain("private"); expect(signOut).not.toHaveBeenCalled();
  });
  it("reports incomplete session cleanup separately from a completed password change", async () => {
    const result = await completePasswordRecovery({ claims, userId: "test-user", password: "Synthetic!234", confirmation: "Synthetic!234", now, update: async () => ({ error: null }), signOut: async () => ({ error: { message: "private" } }) });
    expect(result.status).toBe("signout-incomplete"); expect(JSON.stringify(result)).not.toContain("private");
  });
});
