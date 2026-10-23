import { createServiceClient } from "@/lib/supabase/service";
import { isPaymentQrImagePathOwnedBy } from "@/lib/payments/paymentQrCode";

export const runtime = "nodejs";

// Frozen R1 verification scope. Never derive deletion targets from request input
// or a mutable queue row. The normal scheduled GET remains disabled operationally.
const r1Jobs = [
  {
    id: "1d1d3454-7c67-46b1-aed7-6e80d24979ae",
    store_id: "b1e92d84-6517-4d51-a2e7-b78ce78dae0e",
    payment_method_id: "42a643c5-06e2-4053-bf3e-d5eaed1e2841",
    storage_path: "stores/b1e92d84-6517-4d51-a2e7-b78ce78dae0e/payment-methods/42a643c5-06e2-4053-bf3e-d5eaed1e2841/cfb677fc-3f13-4012-a37e-ec8d66003aa6.png",
  },
  {
    id: "4d800f71-8880-4312-99b7-65a9c6ffab3c",
    store_id: "4da89ba8-3eb6-40fb-9a7f-1e68a1f58c93",
    payment_method_id: "7d27d546-0f9f-448b-a3c9-b31a424e8c61",
    storage_path: "stores/4da89ba8-3eb6-40fb-9a7f-1e68a1f58c93/payment-methods/7d27d546-0f9f-448b-a3c9-b31a424e8c61/9f4fb6c9-3c11-47cf-943f-c8a8305e58df.png",
  },
] as const;

// Explicit POST avoids accidentally invoking the general scheduled GET worker.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let processed = 0;
  let removed = 0;
  const stop = (status: number, persistenceFailed = 0) => Response.json(
    { processed, removed, failed: 1, skipped: 0, persistenceFailed }, { status },
  );
  try {
    if (request.headers.get("x-lumina-r1-verify") !== "exact-two-qr-jobs"
      || new URL(request.url).search || await request.text() !== "") {
      return stop(400);
    }
    const supabase = createServiceClient();
    const { data: jobs, error } = await supabase.from("payment_qr_cleanup_jobs")
      .select("id, storage_path, store_id, payment_method_id, attempts")
      .in("id", r1Jobs.map(job => job.id));
    if (error) return stop(500);
    // Validate BOTH records before the first deletion, including duplicate/missing IDs.
    if (!jobs || jobs.length !== 2 || !r1Jobs.every(expected =>
      jobs.filter(job => job.id === expected.id
        && job.store_id === expected.store_id
        && job.payment_method_id === expected.payment_method_id
        && job.storage_path === expected.storage_path
        && job.attempts === 0).length === 1)) return stop(409);

    for (const expected of r1Jobs) {
      processed++;
      const { error: removeError } = await supabase.storage
        .from("payment-qr-codes").remove([expected.storage_path]);
      if (removeError) return stop(500);
      // A concurrent retarget/replacement must not be acknowledged or modified.
      const { data: deleted, error: deleteError } = await supabase
        .from("payment_qr_cleanup_jobs").delete()
        .eq("id", expected.id).eq("storage_path", expected.storage_path)
        .eq("store_id", expected.store_id)
        .eq("payment_method_id", expected.payment_method_id)
        .eq("attempts", 0).select("id");
      if (deleteError) return stop(500, 1);
      if (deleted?.length !== 1 || deleted[0].id !== expected.id) return stop(409, 1);
      removed++;
    }
    return Response.json({ processed, removed, failed: 0, skipped: 0, persistenceFailed: 0 });
  } catch {
    // Never return request headers, secrets, raw SDK errors or upstream bodies.
    return stop(500);
  }
}

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
