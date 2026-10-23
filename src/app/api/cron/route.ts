import { createServiceClient } from "@/lib/supabase/service";
import { isPaymentQrImagePathOwnedBy } from "@/lib/payments/paymentQrCode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: jobs, error: jobsError } = await supabase
    .from("payment_qr_cleanup_jobs")
    .select("id, storage_path, attempts, store_id, payment_method_id")
    // Legacy jobs have no trustworthy authorizing scope. Leave them for review,
    // outside the batch limit, rather than inferring authority from the path.
    .not("store_id", "is", null)
    .not("payment_method_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (jobsError) {
    return Response.json(
      { error: "Could not load payment QR cleanup jobs." },
      { status: 500 },
    );
  }

  let removedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let persistenceFailedCount = 0;

  for (const job of jobs ?? []) {
    if (!isPaymentQrImagePathOwnedBy(job.storage_path, {
      storeId: job.store_id,
      paymentMethodId: job.payment_method_id,
    })) {
      skippedCount += 1;
      continue;
    }

    const { error: removeError } = await supabase.storage
      .from("payment-qr-codes")
      .remove([job.storage_path]);

    if (removeError) {
      failedCount += 1;

      const { error: updateError } = await supabase
        .from("payment_qr_cleanup_jobs")
        .update({
          attempts: job.attempts + 1,
          last_error: removeError.message,
        })
        .eq("id", job.id);

      if (updateError) persistenceFailedCount += 1;

      continue;
    }

    const { error: deleteError } = await supabase
      .from("payment_qr_cleanup_jobs")
      .delete()
      .eq("id", job.id);

    if (deleteError) {
      // Storage deletion is idempotent. Retain the queue row for a later run
      // rather than reporting an unfinished acknowledgement as success.
      failedCount += 1;
      persistenceFailedCount += 1;
    } else {
      removedCount += 1;
    }
  }

  return Response.json({
    processed: (jobs ?? []).length,
    removed: removedCount,
    failed: failedCount,
    skipped: skippedCount,
    persistenceFailed: persistenceFailedCount,
  }, { status: failedCount > 0 ? 500 : 200 });
}
