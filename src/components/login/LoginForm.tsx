"use client";

import { Lock, Mail } from "lucide-react";
import { useState } from "react";
import AuthButton from "../auth/AuthButton";
import AuthInput from "../auth/AuthInput";

import { useRouter } from "next/navigation";
import { getSignInDestination } from "@/lib/auth/getSignInDestination";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type LoginFormProps = {
  storeSlug?: string;
  initialNotice?: string;
};

export default function LoginForm({
  storeSlug,
  initialNotice = "",
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice("");

    const supabase = createClient();

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setLoading(false);
      setNotice("Email or password is incorrect.");
      return;
    }

    const [{ data: profile, error: profileError }, { data: storeMembership }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("is_platform_admin")
          .eq("id", signInData.user.id)
          .single(),

        supabase
          .from("store_members")
          .select("id")
          .eq("user_id", signInData.user.id)
          .in("role", ["owner", "admin"])
          .limit(1)
          .maybeSingle(),
      ]);

    if (profileError) {
      setLoading(false);
      setNotice("We could not load your account access. Please try again.");
      return;
    }

    router.replace(
      getSignInDestination(
        profile.is_platform_admin,
        Boolean(storeMembership),
        Boolean(signInData.user.user_metadata.merchant_intent),
        storeSlug,
      ),
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <AuthInput
        id="login-email"
        name="email"
        label="Email Address"
        placeholder="alex@example.com"
        icon={Mail}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
      />

      <div>
        <AuthInput
          id="login-password"
          name="password"
          label="Password"
          placeholder="••••••••"
          icon={Lock}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <div className="mt-2 text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-primary transition hover:underline">Forgot Password?</Link>
        </div>
      </div>

      <AuthButton
        type="submit"
        loading={loading}
        loadingtext="Logging In..."
      >
        Login
      </AuthButton>

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-primary-container/25 px-3 py-2 text-center text-xs leading-relaxed text-on-primary-container"
        >
          {notice}
        </p>
      )}
    </form>
  );
}
