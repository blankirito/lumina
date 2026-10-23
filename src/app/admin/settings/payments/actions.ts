"use server";

import { revalidatePath } from "next/cache";
import {
  getAdminStoreId,
  type StoreMembershipRole,
} from "@/lib/products/adminStore";
import { prepareNewStorePaymentMethod } from "@/lib/payments/newStorePaymentMethod";
import {
  buildPaymentQrImagePath,
  hasPaymentQrImageSignature,
  isPaymentQrImagePathOwnedBy,
  preparePaymentQrUpload,
  type PaymentQrImageScope,
} from "@/lib/payments/paymentQrCode";
import { getPaymentQrImageChange } from "@/lib/payments/paymentQrChange";
import { prepareStorePaymentMethodUpdate } from "@/lib/payments/storePaymentMethodUpdate";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type UpdateStorePaymentMethodInput = {
  paymentMethodId: string;
  label: string;
  instructions: string;
  isEnabled: boolean;
};

type ParsedPaymentMethodUpdate = {
  paymentMethodId: string;
  label: string;
  instructions: string;
  isEnabled: boolean;
  qrImage: File | null;
  removeQr: boolean;
};

function parsePaymentMethodUpdate(
  input: UpdateStorePaymentMethodInput | FormData,
): ParsedPaymentMethodUpdate {
  if (!(input instanceof FormData)) {
    return {
      paymentMethodId: input.paymentMethodId,
      label: input.label,
      instructions: input.instructions,
      isEnabled: input.isEnabled,
      qrImage: null,
      removeQr: false,
    };
  }

  const qrImageValue = input.get("qrImage");

  return {
    paymentMethodId: String(input.get("paymentMethodId") ?? ""),
    label: String(input.get("label") ?? ""),
    instructions: String(input.get("instructions") ?? ""),
    isEnabled: input.get("isEnabled") === "true",
    qrImage:
      qrImageValue instanceof File && qrImageValue.size > 0
        ? qrImageValue
        : null,
    removeQr: input.get("removeQr") === "true",
  };
}

async function queuePaymentQrCleanup(
  serviceClient: ReturnType<typeof createServiceClient>,
  storagePath: string,
  cleanupError: string,
  scope: PaymentQrImageScope,
) {
  const { error } = await serviceClient
    .from("payment_qr_cleanup_jobs")
    .upsert(
      {
        storage_path: storagePath,
        store_id: scope.storeId,
        payment_method_id: scope.paymentMethodId,
        last_error: cleanupError,
      },
      {
        onConflict: "storage_path",
      },
    );

  if (error) {
    console.error("Could not queue payment QR cleanup.", error);
  }
}

async function removePaymentQrImage(
  serviceClient: ReturnType<typeof createServiceClient>,
  storagePath: string,
  scope: PaymentQrImageScope,
) {
  // qr_image_path is writable through the store owner's database policy.
  // A stored value is not authority to delete an object using service access.
  if (!isPaymentQrImagePathOwnedBy(storagePath, scope)) {
    return;
  }

  const { error } = await serviceClient.storage
    .from("payment-qr-codes")
    .remove([storagePath]);

  if (error) {
    await queuePaymentQrCleanup(
      serviceClient,
      storagePath,
      error.message,
      scope,
    );
  }
}

export async function updateStorePaymentMethod(
  input: UpdateStorePaymentMethodInput | FormData,
) {
  const parsedInput = parsePaymentMethodUpdate(input);

  const preparedUpdate = prepareStorePaymentMethodUpdate({
    label: parsedInput.label,
    instructions: parsedInput.instructions,
    isEnabled: parsedInput.isEnabled,
  });

  if ("error" in preparedUpdate) {
    return preparedUpdate;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You must be signed in to update payment methods.",
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("store_members")
    .select("store_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"]);

  if (membershipError) {
    return {
      error: "We could not confirm your store access.",
    };
  }

  const storeId = getAdminStoreId(
    (memberships ?? []).map((membership) => ({
      storeId: membership.store_id,
      role: membership.role as StoreMembershipRole,
    })),
  );

  if (!storeId) {
    return {
      error: "You do not have permission to manage this store.",
    };
  }

  const { data: currentPaymentMethod, error: currentPaymentMethodError } =
    await supabase
      .from("store_payment_methods")
      .select("id, qr_image_path")
      .eq("id", parsedInput.paymentMethodId)
      .eq("store_id", storeId)
      .maybeSingle();

  if (currentPaymentMethodError || !currentPaymentMethod) {
    return {
      error:
        "Payment method not found or you do not have permission to update it.",
    };
  }

  let replacementQrImagePath: string | null = null;
  let serviceClient: ReturnType<typeof createServiceClient> | null = null;

  if (parsedInput.qrImage) {
    const preparedQrUpload = preparePaymentQrUpload({
      name: parsedInput.qrImage.name,
      type: parsedInput.qrImage.type,
      size: parsedInput.qrImage.size,
    });

    if ("error" in preparedQrUpload) {
      return preparedQrUpload;
    }

    let qrImageBytes: Uint8Array;

    try {
      qrImageBytes = new Uint8Array(
        await parsedInput.qrImage.arrayBuffer(),
      );
    } catch {
      return {
        error: "Could not read the QR image. Please choose another file.",
      };
    }

    if (
      !hasPaymentQrImageSignature(
        qrImageBytes,
        preparedQrUpload.data.extension,
      )
    ) {
      return {
        error: "The uploaded file does not match its image type.",
      };
    }

    replacementQrImagePath = buildPaymentQrImagePath({
      storeId,
      paymentMethodId: currentPaymentMethod.id,
      imageId: crypto.randomUUID(),
      extension: preparedQrUpload.data.extension,
    });

    serviceClient = createServiceClient();

    const { error: uploadError } = await serviceClient.storage
      .from("payment-qr-codes")
      .upload(replacementQrImagePath, parsedInput.qrImage, {
        contentType: parsedInput.qrImage.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        error: "Could not upload the QR image. Please try again.",
      };
    }
  }

  const qrImageChange = getPaymentQrImageChange({
    currentQrImagePath: currentPaymentMethod.qr_image_path,
    replacementQrImagePath,
    removeQr: parsedInput.removeQr,
  });

  const { data: paymentMethod, error: paymentMethodError } = await supabase
    .from("store_payment_methods")
    .update({
      label: preparedUpdate.data.label,
      instructions: preparedUpdate.data.instructions,
      qr_image_path: qrImageChange.qrImagePath,
      is_enabled: preparedUpdate.data.isEnabled,
    })
    .eq("id", currentPaymentMethod.id)
    .eq("store_id", storeId)
    .select("id")
    .maybeSingle();

  if (paymentMethodError || !paymentMethod) {
    if (replacementQrImagePath && serviceClient) {
      await removePaymentQrImage(
        serviceClient,
        replacementQrImagePath,
        { storeId, paymentMethodId: currentPaymentMethod.id },
      );
    }

    return {
      error:
        "Payment method could not be updated. Your existing QR image was not changed.",
    };
  }

  if (qrImageChange.obsoleteQrImagePath) {
    const cleanupClient = serviceClient ?? createServiceClient();

    await removePaymentQrImage(
      cleanupClient,
      qrImageChange.obsoleteQrImagePath,
      { storeId, paymentMethodId: currentPaymentMethod.id },
    );
  }

  revalidatePath("/admin/settings/payments");

  return {
    paymentMethodId: paymentMethod.id,
  };
}

type CreateStorePaymentMethodInput = {
  label: string;
  instructions: string;
};

export async function createStorePaymentMethod(
  input: CreateStorePaymentMethodInput,
) {
  const preparedMethod = prepareNewStorePaymentMethod(input);

  if ("error" in preparedMethod) {
    return preparedMethod;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You must be signed in to add payment methods.",
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("store_members")
    .select("store_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"]);

  if (membershipError) {
    return {
      error: "We could not confirm your store access.",
    };
  }

  const storeId = getAdminStoreId(
    (memberships ?? []).map((membership) => ({
      storeId: membership.store_id,
      role: membership.role as StoreMembershipRole,
    })),
  );

  if (!storeId) {
    return {
      error: "You do not have permission to manage this store.",
    };
  }

  const { data: paymentMethod, error: paymentMethodError } = await supabase
    .from("store_payment_methods")
    .insert({
      store_id: storeId,
      code: `custom_${crypto.randomUUID()}`,
      label: preparedMethod.data.label,
      instructions: preparedMethod.data.instructions,
      is_enabled: preparedMethod.data.isEnabled,
      sort_order: 999,
    })
    .select("id")
    .single();

  if (paymentMethodError || !paymentMethod) {
    return {
      error: "We could not add this payment method. Please try again.",
    };
  }

  revalidatePath("/admin/settings/payments");

  return {
    paymentMethodId: paymentMethod.id,
  };
}
