import { describe, expect, it } from "vitest";
import type { AdminCustomerStatus, AdminReportingCustomer } from "./adminCustomerReporting";
import {
  buildAdminOrdersCsv,
  filterAndSortAdminOrders,
  getAdminListPage,
  sortAdminCustomers,
  sortAdminProducts,
} from "./adminListControls";
import type { AdminOrder } from "@/lib/orders/adminOrder";
import type { AdminProduct } from "@/lib/products/adminProduct";

function product(
  id: string,
  name: string,
  stock: number,
  createdAt: string,
): AdminProduct {
  return {
    id,
    name,
    stock,
    createdAt,
  } as AdminProduct;
}

function order(
  id: string,
  createdAt: string,
  overrides: Partial<AdminOrder> = {},
): AdminOrder {
  return {
    id,
    createdAt,
    customerId: null,
    customerName: "Lee Chongyu",
    customerEmail: "lee@example.com",
    status: "New",
    paymentStatus: "Pending",
    initials: "LC",
    total: 120,
    itemCount: 1,
    firstItemImagePath: null,
    payment: "Bank Transfer",
    ...overrides,
  };
}

function customer(
  id: string,
  totalSpent: number,
  firstOrderAt: string,
  lastOrderAt: string,
): AdminReportingCustomer {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    phone: null,
    location: "Kuala Lumpur, Malaysia",
    orderCount: 1,
    paidOrderCount: 1,
    totalSpent,
    isGuest: false,
    firstOrderAt,
    lastOrderAt,
    status: "Active" as AdminCustomerStatus,
  };
}

describe("admin list controls", () => {
  it("sorts products without mutating the original list", () => {
    const products = [
      product("older", "Zinc Serum", 8, "2026-09-01T10:00:00.000Z"),
      product("newer", "Aloe Cleanser", 2, "2026-09-20T10:00:00.000Z"),
      product("middle", "Berry Mask", 5, "2026-09-10T10:00:00.000Z"),
    ];

    expect(sortAdminProducts(products, "newest").map((item) => item.id)).toEqual([
      "newer",
      "middle",
      "older",
    ]);

    expect(sortAdminProducts(products, "oldest").map((item) => item.id)).toEqual([
      "older",
      "middle",
      "newer",
    ]);

    expect(sortAdminProducts(products, "name_asc").map((item) => item.id)).toEqual([
      "newer",
      "middle",
      "older",
    ]);

    expect(sortAdminProducts(products, "stock_asc").map((item) => item.id)).toEqual([
      "newer",
      "middle",
      "older",
    ]);

    expect(products.map((item) => item.id)).toEqual([
      "older",
      "newer",
      "middle",
    ]);
  });

  it("filters orders to the inclusive last 30 days range and sorts them", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");

    const orders = [
      order("outside-range", "2026-08-31T11:59:59.999Z"),
      order("boundary", "2026-08-31T12:00:00.000Z"),
      order("newest", "2026-09-29T12:00:00.000Z"),
    ];

    expect(
      filterAndSortAdminOrders(orders, {
        dateRange: "last_30_days",
        sort: "newest",
        now,
      }).map((item) => item.id),
    ).toEqual(["newest", "boundary"]);

    expect(
      filterAndSortAdminOrders(orders, {
        dateRange: "all",
        sort: "oldest",
        now,
      }).map((item) => item.id),
    ).toEqual(["outside-range", "boundary", "newest"]);
  });

  it("sorts customers by spending and account age", () => {
    const customers = [
      customer(
        "recent-low-spend",
        20,
        "2026-09-20T10:00:00.000Z",
        "2026-09-20T10:00:00.000Z",
      ),
      customer(
        "old-high-spend",
        500,
        "2026-01-01T10:00:00.000Z",
        "2026-09-01T10:00:00.000Z",
      ),
      customer(
        "middle-spend",
        100,
        "2026-06-01T10:00:00.000Z",
        "2026-09-10T10:00:00.000Z",
      ),
    ];

    expect(
      sortAdminCustomers(customers, "highest_spent").map((item) => item.id),
    ).toEqual(["old-high-spend", "middle-spend", "recent-low-spend"]);

    expect(
      sortAdminCustomers(customers, "most_recent").map((item) => item.id),
    ).toEqual(["recent-low-spend", "middle-spend", "old-high-spend"]);

    expect(
      sortAdminCustomers(customers, "oldest_customer").map((item) => item.id),
    ).toEqual(["old-high-spend", "middle-spend", "recent-low-spend"]);
  });

  it("creates safe CSV rows for filtered orders", () => {
    const csv = buildAdminOrdersCsv([
      order("ORD-001001", "2026-09-30T12:00:00.000Z", {
        customerName: '=HYPERLINK("https://example.com")',
        customerEmail: "lee,customer@example.com",
        status: "Processing",
        paymentStatus: "Paid",
        payment: "Bank Transfer",
        total: 123.45,
      }),
    ]);

    expect(csv).toBe(
      [
        "Order Number,Date,Customer Name,Customer Email,Fulfilment Status,Payment Status,Payment Method,Total",
        `ORD-001001,2026-09-30T12:00:00.000Z,"'=HYPERLINK(""https://example.com"")","lee,customer@example.com",Processing,Paid,Bank Transfer,123.45`,
      ].join("\r\n"),
    );
  });
  it("shows the remaining orders on the second page", () => {
    const orders = Array.from({ length: 8 }, (_, index) =>
      order(
        `ORD-00000${index + 1}`,
        `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );

    expect(getAdminListPage(orders, 1, 5).items.map((item) => item.id)).toEqual([
      "ORD-000001",
      "ORD-000002",
      "ORD-000003",
      "ORD-000004",
      "ORD-000005",
    ]);

    expect(getAdminListPage(orders, 2, 5).items.map((item) => item.id)).toEqual([
      "ORD-000006",
      "ORD-000007",
      "ORD-000008",
    ]);
  });
});
