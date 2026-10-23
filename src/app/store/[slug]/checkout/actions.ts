"use server";

import { createServiceClient } from "@/lib/supabase/service";
import {
    prepareGuestCheckoutRequest,
    type GuestCheckoutRequest,
} from "@/lib/storefront/guestCheckout";
import { buildCheckoutOrderRpcParams } from "@/lib/storefront/checkoutOrderRpc";
import { createClient } from "@/lib/supabase/server";

type CheckoutSuccess = {
    order_id: string;
    order_number: string;
    tracking_token: string;
    payment_method_label: string;
    payment_instructions: string;
    replayed: boolean;
};

export type SubmitGuestCheckoutResult =
    | { status: "success"; order: CheckoutSuccess }
    | { status: "error"; message: string; retryable: boolean };

const uncertainResult: SubmitGuestCheckoutResult = {
    status: "error", retryable: true,
    message: "Your checkout result could not be confirmed. Use Recover checkout to safely check the same order.",
};

export async function submitGuestCheckout(
    input: GuestCheckoutRequest,
    attemptKey: string,
): Promise<SubmitGuestCheckoutResult> {
    let request: GuestCheckoutRequest;
    try {
        if (!/^[a-f0-9]{64}$/.test(attemptKey)) throw new Error("A saved checkout attempt is required. Refresh and try again.");
        request = prepareGuestCheckoutRequest(input);
    } catch {
        // Local validation cannot establish whether an earlier valid request
        // with this key committed. Never discard its recovery capability.
        return uncertainResult;
    }
    try {
        const authSupabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await authSupabase.auth.getUser();
        if (authError && authError.name !== "AuthSessionMissingError") return uncertainResult;

        const supabase = createServiceClient();

        const { data, error } = await supabase.rpc(
            "create_checkout_order_idempotent",
            { ...buildCheckoutOrderRpcParams(request, user?.id), p_attempt_key: attemptKey },
        );

        if (error) {
            // Only our explicit pre-order validation code proves no order was
            // committed. Transport, auth changes and conflicts retain the key.
            if (error.code === "P0002") return { status: "error", retryable: false, message: "The order was not placed. Check stock, payment method and required details, then try again." };
            return uncertainResult;
        }

        const order = (data as CheckoutSuccess[] | null)?.[0];

        if (!order) {
            return uncertainResult;
        }

        return {
            status: "success",
            order,
        };
    } catch {
        return uncertainResult;
    }
}
