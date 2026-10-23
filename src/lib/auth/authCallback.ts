import { AUTH_LINK_FAILURE } from "./emailAuth";

export function getSafeAuthCallbackStoreSlug(
    value: string | null,
): string | undefined {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
        return undefined;
    }

    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
        ? normalized
        : undefined;
}

export function getSafeAuthCallbackNext(value: string | null): string {
    if (
        !value ||
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.includes("\\") ||
        // URL parsing strips these characters and can turn /<tab>/host into //host.
        ["\t", "\n", "\r"].some((character) => value.includes(character))
    ) {
        return "/";
    }

    return value;
}

export function getSafeLoginNotice(value: string | null): string {
    if (value === "auth-link-invalid") return AUTH_LINK_FAILURE;
    if (value === "password-reset") return "Password changed. Sign in with your new password.";
    return value === "google-sign-in-failed"
        ? "Google sign-in could not be completed. Please try again."
        : "";
}
