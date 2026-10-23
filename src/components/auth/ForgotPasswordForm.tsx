"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordRecovery } from "@/lib/auth/emailAuth";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    setMessage(await requestPasswordRecovery((address, options) => supabase.auth.resetPasswordForEmail(address, options), email, window.location.origin));
    setLoading(false);
  }
  return <form onSubmit={submit} className="flex flex-col gap-5">
    <AuthInput id="recovery-email" name="email" label="Email Address" placeholder="alex@example.com" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    <AuthButton type="submit" loading={loading} loadingtext="Requesting email...">Send reset link</AuthButton>
    {message && <p role="status" className="text-sm text-on-surface-variant">{message}</p>}
  </form>;
}
