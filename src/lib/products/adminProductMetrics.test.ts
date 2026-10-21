import { describe, expect, it } from "vitest";
import { getAdminProductMetrics } from "./adminProductMetrics";

const productDetails = {
  collection: null,
  dimensions: null,
  weight: null,
  features: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("admin product metrics", () => {
  it("counts in-stock and low-stock products from real inventory values", () => {
    const metrics = getAdminProductMetrics([
      {
        id: "product-1",
        ...productDetails,
        sku: "SER-001",
        name: "Glow Serum",
        description: "Hydrating serum",
        category: "Skincare",
        price: 89,
        stock: 12,
        lowStockThreshold: 5,
        status: "active",
        isNew: false,
        imagePaths: [],
        primaryImagePath: null,
      },
      {
        id: "product-2",
        ...productDetails,
        sku: "CRE-001",
        name: "Face Cream",
        description: "Daily face cream",
        category: "Skincare",
        price: 65,
        stock: 5,
        lowStockThreshold: 5,
        status: "active",
        isNew: false,
        imagePaths: [],
        primaryImagePath: null,
      },
      {
        id: "product-3",
        ...productDetails,
        sku: "LIP-001",
        name: "Velvet Lipstick",
        description: "Matte lipstick",
        category: "Makeup",
        price: 29,
        stock: 0,
        lowStockThreshold: 3,
        status: "draft",
        isNew: true,
        imagePaths: [],
        primaryImagePath: null,
      },
            {
        id: "product-4",
        ...productDetails,
        sku: "OLD-001",
        name: "Old Product",
        description: "Archived product",
        category: "Hair",
        price: 20,
        stock: 50,
        lowStockThreshold: 5,
        status: "archived",
        isNew: false,
        imagePaths: [],
        primaryImagePath: null,
      },
    ]);

    expect(metrics).toEqual({
      catalogProductCount: 3,
      inStockCount: 1,
      lowStockCount: 2,
      categoryCount: 2,
    });
  });
});
