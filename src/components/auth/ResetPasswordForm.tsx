"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { resetPassword } from "@/app/reset-password/actions";
import { prepareResetPassword, type ResetResult } from "@/lib/auth/emailAuth";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const finished = result?.status === "success" || result?.status === "signout-incomplete" || result?.status === "invalid-link";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || finished) return;
    try { prepareResetPassword(password, confirmation); }
    catch (error) { setResult({ status: "error", message: error instanceof Error ? error.message : "Check your new password." }); return; }
    setLoading(true);
    try { setResult(await resetPassword(password, confirmation)); }
    catch { setResult({ status: "error", message: "Could not confirm the password change. Try signing in or request a fresh reset link." }); }
    finally { setPassword(""); setConfirmation(""); setLoading(false); }
  }
  return <div className="flex flex-col gap-5">
    {!finished && <form onSubmit={submit} className="flex flex-col gap-5">
      <p>Use 8–128 characters, including a number and a symbol (!@#$%^&amp;*).</p>
      <AuthInput id="reset-password" name="new-password" label="New Password" placeholder="New password" icon={Lock} type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <AuthInput id="reset-confirmation" name="confirm-password" label="Confirm New Password" placeholder="Repeat new password" icon={Lock} type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      <AuthButton type="submit" loading={loading} loadingtext="Updating password...">Reset password</AuthButton>
    </form>}
    {result && <p role="status">{result.message}</p>}
    {finished && <Link href="/login" className="text-primary underline">Sign in</Link>}
    <Link href="/forgot-password" className="text-primary underline">Request a new reset link</Link>
  </div>;
}
