import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AUTH_LINK_FAILURE, hasRecentRecovery } from "@/lib/auth/emailAuth";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  let allowed = false;
  try {
    const supabase = await createClient();
    const [{ data: userData, error: userError }, { data: claimData, error: claimError }] = await Promise.all([
      supabase.auth.getUser(), supabase.auth.getClaims(),
    ]);
    allowed = !userError && !claimError && !!userData.user && hasRecentRecovery(claimData?.claims, userData.user.id);
  } catch { /* A missing or unverified session must never expose the reset form. */ }
  return <main className="min-h-screen flex items-center justify-center px-5">
    <section className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-sm flex flex-col gap-6">
      <h1 className="text-3xl font-display">Reset password</h1>
      {allowed ? <ResetPasswordForm /> : <>
        <p role="status">{AUTH_LINK_FAILURE}</p>
        <Link href="/forgot-password" className="text-primary underline">Request a new reset link</Link>
        <Link href="/login" className="text-primary underline">Back to sign in</Link>
      </>}
    </section>
  </main>;
}
