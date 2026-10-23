"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Flower2,
  Lock,
  Mail,
  Phone,
  Store,
  User,
} from "lucide-react";
import { getSignUpDestination } from "@/lib/auth/getSignUpDestination";
import { createClient } from "@/lib/supabase/client";
import { getEmailAuthRedirect } from "@/lib/auth/emailAuth";

export default function MerchantRegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Your passwords do not match. Please try again.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const destination = getSignUpDestination(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          merchant_intent: true,
        },
        emailRedirectTo: getEmailAuthRedirect(window.location.origin),
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data.session) {
      setMessage(
        "Check your email to confirm your merchant account. Open the link in this browser to continue setting up your store.",
      );
      return;
    }

    router.replace(destination);
    router.refresh();
  }

  return (
    <div className="pb-12">
      <header className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-primary transition hover:opacity-80"
        >
          <Flower2 size={21} />
          <span className="font-display text-2xl text-on-surface">Lumina</span>
        </Link>

        <Link
          href="/login"
          className="text-xs font-semibold text-on-surface-variant transition hover:text-primary"
        >
          Already a merchant?{" "}
          <span className="text-primary underline underline-offset-4">
            Sign in
          </span>
        </Link>
      </header>

      <section className="pt-7">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary-container/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-on-secondary-container">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Sell with Lumina
        </div>

        <h1 className="mt-4 font-display text-4xl leading-tight text-on-surface">
          Build a boutique that feels like yours.
        </h1>

        <p className="mt-3 max-w-sm text-sm leading-6 text-on-surface-variant">
          Apply to join our curated merchant community. Approved boutiques
          receive an exclusive 14-day launch trial.
        </p>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-surface-low p-3 shadow-sm">
        {[
          ["01", "Apply", "Credentials & bio"],
          ["02", "Review", "Curated review"],
          ["03", "Launch", "14-day trial"],
        ].map(([number, title, detail]) => (
          <div
            key={title}
            className="flex min-h-24 flex-col items-center justify-center rounded-xl bg-surface px-2 text-center"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container/45 text-xs font-bold text-primary">
              {number}
            </span>
            <span className="mt-2 text-xs font-bold text-on-surface">
              {title}
            </span>
            <span className="mt-1 text-[10px] leading-3 text-on-surface-variant">
              {detail}
            </span>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl bg-surface p-6 shadow-[0_8px_28px_rgba(119,87,77,0.08)]">
        <div className="flex items-center justify-between rounded-xl bg-surface-low px-3 py-3">
          <div className="flex items-center gap-2">
            <Store size={19} className="text-primary" />
            <span className="text-xs font-semibold tracking-wide text-on-surface">
              Merchant Onboarding
            </span>
          </div>
          <span className="text-xs font-semibold text-primary">
            Tier 1 · Curated
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-on-surface-variant">
              Founder&apos;s Full Name
            </span>
            <span className="relative block">
              <User
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="e.g. Claire Delacroix"
                autoComplete="name"
                required
                className="w-full rounded-xl bg-surface-low py-3 pl-10 pr-4 text-sm text-on-surface outline-none transition placeholder:text-outline-variant focus:bg-surface focus:ring-2 focus:ring-primary/35"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-on-surface-variant">
              Boutique Business Email
            </span>
            <span className="relative block">
              <Mail
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="claire@yourboutique.com"
                autoComplete="email"
                required
                className="w-full rounded-xl bg-surface-low py-3 pl-10 pr-4 text-sm text-on-surface outline-none transition placeholder:text-outline-variant focus:bg-surface focus:ring-2 focus:ring-primary/35"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-on-surface-variant">
              Contact Phone
              <span className="font-normal text-outline">
                For merchant verification
              </span>
            </span>
            <span className="relative block">
              <Phone
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+60 12-345 6789"
                autoComplete="tel"
                required
                className="w-full rounded-xl bg-surface-low py-3 pl-10 pr-4 text-sm text-on-surface outline-none transition placeholder:text-outline-variant focus:bg-surface focus:ring-2 focus:ring-primary/35"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-on-surface-variant">
              Create Password
              <span className="font-normal text-outline">Min. 8 characters</span>
            </span>
            <span className="relative block">
              <Lock
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full rounded-xl bg-surface-low py-3 pl-10 pr-12 text-sm text-on-surface outline-none transition placeholder:text-outline-variant focus:bg-surface focus:ring-2 focus:ring-primary/35"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-outline transition hover:text-on-surface"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-on-surface-variant">
              Confirm Password
            </span>
            <span className="relative block">
              <Lock
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full rounded-xl bg-surface-low py-3 pl-10 pr-12 text-sm text-on-surface outline-none transition placeholder:text-outline-variant focus:bg-surface focus:ring-2 focus:ring-primary/35"
              />
              <button
                type="button"
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
                onClick={() =>
                  setShowConfirmPassword((visible) => !visible)
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-outline transition hover:text-on-surface"
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 pt-2 text-xs leading-5 text-on-surface-variant">
            <input
              type="checkbox"
              checked={hasAcceptedTerms}
              onChange={(event) => setHasAcceptedTerms(event.target.checked)}
              required
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              I agree to the{" "}
              <a href="#" className="text-primary underline underline-offset-2">
                Merchant Terms
              </a>{" "}
              and{" "}
              <a href="#" className="text-primary underline underline-offset-2">
                Privacy Standards
              </a>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(119,87,77,0.22)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              "Securing your boutique space..."
            ) : (
              <>
                Create merchant account
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {message && (
            <p
              role="status"
              className="rounded-xl bg-primary-container/25 px-3 py-3 text-center text-xs leading-5 text-on-primary-container"
            >
              {message}
            </p>
          )}
        </form>
      </section>

      <footer className="mt-8 text-center">
        <p className="text-xs text-on-surface-variant">
          Looking to discover and shop?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Create a customer account
          </Link>
        </p>

        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <Check size={13} className="text-primary" />
            Secure account
          </span>
          <span>•</span>
          <span>14-day trial</span>
          <span>•</span>
          <span>Curated marketplace</span>
        </div>
      </footer>
    </div>
  );
}
