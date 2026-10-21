import { describe, expect, it } from "vitest";
import { toAdminOrder } from "./adminOrder";

describe("admin order mapping", () => {
  it("maps a database order to the format used by the admin order list", () => {
    const order = toAdminOrder({
      id: "order-1",
      order_number: "ORD-001000",
      customer_id: null,
      customer_name: "Test Customer",
      customer_email: "test.customer@example.com",
      payment_status: "paid",
      fulfillment_status: "new",
      payment_method: "custom-payment-code",
payment_method_label: "Test Payment",
      total: 1,
      created_at: "2026-09-22T10:00:00.000Z",
      order_items: [
  {
    id: "item-1",
    products: {
      product_images: [
        {
          storage_path: "products/glow-serum.jpg",
          is_primary: true,
          sort_order: 0,
        },
      ],
    },
  },
],
    });

    expect(order).toEqual({
      id: "ORD-001000",
      customerId: null,
      status: "New",
      paymentStatus: "Paid",
      createdAt: "2026-09-22T10:00:00.000Z",
      customerName: "Test Customer",
      customerEmail: "test.customer@example.com",
      initials: "TC",
      total: 1,
      itemCount: 1,
      payment: "Test Payment",
      firstItemImagePath: "products/glow-serum.jpg",
    });
  });
});
