/** Use one exact allowlisted URL; final destinations must not bypass code exchange. */
export function getEmailAuthRedirect(origin: string): string {
  return new URL("/auth/callback", origin).toString();
}

export const AUTH_LINK_FAILURE = "This link is invalid, expired, already used, or was opened in a different browser. Request a new email and open it in the browser where you started.";

/** Claims must come from auth.getClaims(), never decode-only JWTs or user_metadata. */
export function hasRecentRecovery(claims: Record<string, unknown> | null | undefined, userId: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!claims || claims.sub !== userId || !userId || typeof claims.session_id !== "string" || !claims.session_id || typeof claims.exp !== "number" || claims.exp <= now || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const method = entry as { method?: unknown; timestamp?: unknown };
    // Hosted Auth can be slightly ahead of the app clock. This only tolerates
    // future skew; it does not extend the 15-minute recovery authorization.
    return method.method === "recovery" && typeof method.timestamp === "number" && Number.isFinite(method.timestamp) && method.timestamp <= now + 30 && now - method.timestamp <= 15 * 60;
  });
}

export function prepareResetPassword(password: string, confirmation: string): string {
  if (typeof password !== "string" || password.length < 8 || password.length > 128 || !/\d/.test(password) || !/[!@#$%^&*]/.test(password)) throw new Error("Use 8–128 characters, including a number and a symbol (!@#$%^&*).");
  if (password !== confirmation) throw new Error("Your new passwords do not match.");
  return password;
}

type AuthOperation = { error: unknown };
type RecoverySender = (email: string, options: { redirectTo: string }) => Promise<AuthOperation>;

export async function requestPasswordRecovery(send: RecoverySender, email: string, origin: string): Promise<string> {
  try {
    await send(email.trim(), { redirectTo: getEmailAuthRedirect(origin) });
  } catch {
    // Never log provider errors, URLs, addresses, codes, or tokens.
  }
  // Identical for unknown users and provider failures: no account enumeration.
  return "If an account exists for this email, a reset link will arrive shortly. Check spam too. Open it in this browser. If nothing arrives, wait before trying again.";
}

export type ResetResult = { status: "success" | "invalid-link" | "error" | "signout-incomplete"; message: string };

export async function completePasswordRecovery(input: {
  claims: Record<string, unknown> | null | undefined;
  userId: string;
  password: string;
  confirmation: string;
  now?: number;
  update: (attributes: { password: string }) => Promise<AuthOperation>;
  signOut: () => Promise<AuthOperation>;
}): Promise<ResetResult> {
  if (!hasRecentRecovery(input.claims, input.userId, input.now)) return { status: "invalid-link", message: AUTH_LINK_FAILURE };
  let password: string;
  try { password = prepareResetPassword(input.password, input.confirmation); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Check your new password." }; }
  try {
    const result = await input.update({ password });
    if (result.error) return { status: "error", message: "Could not change your password. Use a different password or request a fresh reset link." };
  } catch {
    return { status: "error", message: "Could not confirm the password change. Try signing in or request a fresh reset link." };
  }
  try {
    const result = await input.signOut();
    if (!result.error) return { status: "success", message: "Password changed. Sign in with your new password." };
  } catch { /* Password changed, but session cleanup still needs attention. */ }
  return { status: "signout-incomplete", message: "Password changed, but signing out all sessions could not be confirmed. Sign out before continuing and contact support if this persists." };
}
