import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return <main className="min-h-screen flex items-center justify-center px-5">
    <section className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-sm flex flex-col gap-6">
      <h1 className="text-3xl font-display">Forgot password?</h1>
      <p>We&apos;ll email a link to reset your password. Open it in this same browser.</p>
      <ForgotPasswordForm />
      <Link href="/login" className="text-primary underline">Back to sign in</Link>
    </section>
  </main>;
}
