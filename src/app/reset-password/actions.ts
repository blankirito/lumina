"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_LINK_FAILURE, completePasswordRecovery, type ResetResult } from "@/lib/auth/emailAuth";

export async function resetPassword(password: string, confirmation: string): Promise<ResetResult> {
  try {
    const supabase = await createClient();
    const [{ data: userData, error: userError }, { data: claimData, error: claimError }] = await Promise.all([
      supabase.auth.getUser(), supabase.auth.getClaims(),
    ]);
    if (userError || claimError || !userData.user) return { status: "invalid-link", message: AUTH_LINK_FAILURE };
    return await completePasswordRecovery({
      claims: claimData?.claims, userId: userData.user.id, password, confirmation,
      update: (attributes) => supabase.auth.updateUser(attributes),
      signOut: () => supabase.auth.signOut({ scope: "global" }),
    });
  } catch {
    return { status: "invalid-link", message: AUTH_LINK_FAILURE };
  }
}
