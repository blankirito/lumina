import {
    getSafeAuthCallbackNext,
    getSafeAuthCallbackStoreSlug,
} from "@/lib/auth/authCallback";
import { getSignInDestination } from "@/lib/auth/getSignInDestination";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { hasRecentRecovery } from "@/lib/auth/emailAuth";

function authRedirect(request: Request, path: string) {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
}

function getLoginFailureRedirect(request: Request) {
    return authRedirect(request, "/login?notice=auth-link-invalid");
}

export async function GET(request: Request) {
    try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    let storeSlug = getSafeAuthCallbackStoreSlug(
        requestUrl.searchParams.get("store"),
    );
    const safeNext = getSafeAuthCallbackNext(
        requestUrl.searchParams.get("next"),
    );

    if (!code) {
        return getLoginFailureRedirect(request);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
        return getLoginFailureRedirect(request);
    }

    // Only signed Auth claims select recovery, never a URL or cookie hint.
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !claimsData?.claims) return getLoginFailureRedirect(request);
    if (hasRecentRecovery(claimsData.claims, data.user.id)) {
        return authRedirect(request, "/reset-password");
    }

    // This editable metadata is only a validated navigation preference.
    const signupStore = data.user.user_metadata.signup_store;
    storeSlug ??= getSafeAuthCallbackStoreSlug(typeof signupStore === "string" ? signupStore : null);

    const [{ data: profile, error: profileError }, { data: storeMembership }] =
        await Promise.all([
            supabase
                .from("profiles")
                .select("is_platform_admin")
                .eq("id", data.user.id)
                .single(),

            supabase
                .from("store_members")
                .select("id")
                .eq("user_id", data.user.id)
                .in("role", ["owner", "admin"])
                .limit(1)
                .maybeSingle(),
        ]);

    if (profileError || !profile) {
        return getLoginFailureRedirect(request);
    }

    const roleDestination = getSignInDestination(
        profile.is_platform_admin,
        Boolean(storeMembership),
        Boolean(data.user.user_metadata.merchant_intent),
        storeSlug,
    );

    const hasElevatedAccess =
        profile.is_platform_admin ||
        Boolean(storeMembership) ||
        Boolean(data.user.user_metadata.merchant_intent);

    const destination =
        !hasElevatedAccess && safeNext !== "/"
            ? safeNext
            : roleDestination;

    return authRedirect(request, destination);
    } catch {
        // Never include request URLs, provider errors or session payloads in logs.
        return getLoginFailureRedirect(request);
    }
}
