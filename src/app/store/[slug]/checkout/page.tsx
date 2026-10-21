import StorefrontCheckoutPage from "@/components/storefront/StorefrontCheckoutPage";
import {
  getPublicStorefront,
  getPublicStorefrontPaymentMethods,
} from "@/lib/storefront/getPublicStorefront";
import { createClient } from "@/lib/supabase/server";
import {
  getDefaultStorefrontAddress,
  type StorefrontSavedAddress,
} from "@/lib/storefront/storefrontAddresses";

type StorefrontCheckoutRouteProps = {
  params: Promise<{ slug: string }>;
};

type CustomerAddressRow = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

export default async function StorefrontCheckoutRoute({
  params,
}: StorefrontCheckoutRouteProps) {
  const { slug } = await params;

  const storefront = await getPublicStorefront(slug);

  if (!storefront) {
    // Recovery must remain available after a store is suspended. This shell
    // reveals no private store data and cannot start a new checkout.
    return <StorefrontCheckoutPage storeId="" storeName="Store" storeSlug={slug.toLowerCase()}
      customerEmail="" paymentMethods={[]} preferredPaymentMethodId={null}
      savedAddresses={[]} defaultAddressId={null} recoveryOnly />;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [paymentMethods, preferenceResult, addressesResult] =
    await Promise.all([
      getPublicStorefrontPaymentMethods(storefront.slug),
      user
        ? supabase
            .from("customer_store_payment_preferences")
            .select("payment_method_id")
            .eq("user_id", user.id)
            .eq("store_id", storefront.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("customer_addresses")
            .select(`
              id,
              label,
              recipient_name,
              phone,
              address_line_1,
              address_line_2,
              city,
              state,
              postal_code,
              country,
              is_default
            `)
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (preferenceResult.error) {
    throw new Error("Could not load your payment preference.");
  }

  const savedAddresses: StorefrontSavedAddress[] = addressesResult.error
    ? []
    : ((addressesResult.data ?? []) as CustomerAddressRow[]).map(
        (address) => ({
          id: address.id,
          label: address.label,
          recipientName: address.recipient_name,
          phone: address.phone,
          addressLine1: address.address_line_1,
          addressLine2: address.address_line_2,
          city: address.city,
          state: address.state,
          postalCode: address.postal_code,
          country: address.country,
          isDefault: address.is_default,
        }),
      );

  const defaultAddress = getDefaultStorefrontAddress(savedAddresses);

  return (
    <StorefrontCheckoutPage
      storeId={storefront.id}
      storeName={storefront.name}
      storeSlug={storefront.slug}
      customerEmail={user?.email ?? ""}
      paymentMethods={paymentMethods}
      preferredPaymentMethodId={
        preferenceResult.data?.payment_method_id ?? null
      }
      savedAddresses={savedAddresses}
      defaultAddressId={defaultAddress?.id ?? null}
    />
  );
}
import React from "react";
