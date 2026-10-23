"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Minus,
    Plus,
    ShoppingBag,
    Trash2,
} from "lucide-react";
import { useStorefrontCart } from "./StorefrontCartProvider";
import { createClient } from "@/lib/supabase/client";
import {
    toStorefrontProduct,
    type DatabaseStorefrontProduct,
    type StorefrontProduct,
} from "@/lib/storefront/storefrontProduct";
import { toStorefrontCartView } from "@/lib/storefront/storefrontCartView";
import { getPublicProductImageUrl } from "@/lib/products/productImageUrl";

type StorefrontCartPageProps = {
    storeId: string;
    storeName: string;
    storeSlug: string;
};

export default function StorefrontCartPage({
    storeId,
    storeName,
    storeSlug,
}: StorefrontCartPageProps) {
    const { items, isReady, updateQuantity } = useStorefrontCart();

    const cartItems = useMemo(
        () => items.filter((item) => item.storeSlug === storeSlug),
        [items, storeSlug],
    );

    const cartProductIdsKey = useMemo(
    () =>
        [...new Set(cartItems.map((item) => item.productId))]
        .sort()
        .join("|"),
    [cartItems],
    );

    const request = useMemo(
        () => ({ storeId, isReady, cartProductIdsKey }),
        [storeId, isReady, cartProductIdsKey],
    );
    const [loadedProducts, setLoadedProducts] = useState<{
        request: typeof request;
        products: StorefrontProduct[];
    } | null>(null);
    const hasProducts = Boolean(cartProductIdsKey);
    const products = useMemo(
        () => hasProducts && loadedProducts?.request === request
            ? loadedProducts.products
            : [],
        [hasProducts, loadedProducts, request],
    );
    const isLoading = !isReady || (hasProducts && loadedProducts?.request !== request);

    useEffect(() => {
        if (!request.isReady || !request.cartProductIdsKey) return;
        let isCurrent = true;

        async function loadProducts() {
            const { data } = await createClient()
                .from("products")
                .select(`
          id,
          store_id,
          slug,
          name,
          description,
          category,
          price,
          stock,
          rating,
          review_count,
          is_new,
          product_images (
            storage_path,
            alt_text,
            sort_order,
            is_primary
          )
        `)
                .eq("store_id", request.storeId)
                .eq("is_active", true)
                .in("id", request.cartProductIdsKey.split("|").filter(Boolean));

            if (isCurrent) {
                setLoadedProducts({
                    request,
                    products: (data ?? []).map((product) =>
                        toStorefrontProduct(product as DatabaseStorefrontProduct),
                    ),
                });
            }
        }

        void loadProducts();
        return () => {
        isCurrent = false;
    };
    }, [request]);

    const viewItems = toStorefrontCartView(cartItems, products);

    useEffect(() => {
        products.forEach((product) => {
            const cartItem = cartItems.find(
                (item) => item.productId === product.id,
            );

            if (cartItem && cartItem.quantity > product.stock) {
                updateQuantity(
                    storeSlug,
                    product.id,
                    product.stock,
                    product.stock,
                );
            }
        });
    }, [cartItems, products, storeSlug, updateQuantity]);

    const itemCount = viewItems.reduce(
        (total, item) => total + item.quantity,
        0,
    );

    const subtotal = viewItems.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0,
    );

    if (!isReady || isLoading) {
        return (
            <main className="min-h-screen bg-background px-5 py-6">
                <div className="h-8 w-40 animate-pulse rounded bg-surface-low" />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background pb-24">
            <header className="flex h-16 items-center border-b border-outline/30 bg-surface px-5">
                <Link
                    href={`/store/${storeSlug}`}
                    aria-label="Back to store"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-primary"
                >
                    <ArrowLeft size={22} />
                </Link>
                <h1 className="absolute left-1/2 -translate-x-1/2 font-display text-xl text-primary">
                    {storeName}
                </h1>
            </header>

            <section className="flex items-start justify-between px-5 py-6">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
                        {storeName}
                    </p>

                    <h1 className="mt-1 font-display text-3xl text-primary">
                        Your Cart
                    </h1>

                    <p className="mt-1 text-sm text-on-surface-variant">
                        {itemCount === 0
                            ? "Your bag is empty"
                            : `${itemCount} ${itemCount === 1 ? "item" : "items"} in your bag`}
                    </p>
                </div>

                <Link
                    href={`/store/${storeSlug}`}
                    className="pt-2 text-sm font-semibold text-primary"
                >
                    Continue shopping
                </Link>
            </section>

            {viewItems.length === 0 ? (
                <section className="mx-5 rounded-2xl bg-surface-low p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface text-primary">
                        <ShoppingBag size={22} />
                    </div>

                    <h2 className="mt-4 font-display text-2xl text-primary">
                        Your cart is empty
                    </h2>

                    <p className="mt-2 text-sm text-on-surface-variant">
                        Explore {storeName}&apos;s collection and add something you love.
                    </p>

                    <Link
                        href={`/store/${storeSlug}`}
                        className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white"
                    >
                        Continue Shopping
                    </Link>
                </section>
            ) : (
                <>
                    <section className="space-y-4 px-5">
                        {viewItems.map(({ product, quantity }) => (
                            <article
                                key={product.id}
                                className="flex items-center gap-4 rounded-xl bg-surface p-4 shadow-sm"
                            >
                                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-surface-low">
                                    {product.imagePath && process.env.NEXT_PUBLIC_SUPABASE_URL ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={getPublicProductImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, product.imagePath)}
                                            alt={product.imageAlt ?? product.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-on-surface-variant">Image coming soon</div>
                                    )}
                                </div>

                                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h2 className="truncate font-display text-lg text-primary">
                                                {product.name}
                                            </h2>

                                            <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                                                {product.description}
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateQuantity(storeSlug, product.id, 0)
                                            }
                                            aria-label={`Remove ${product.name} from cart`}
                                            className="text-outline hover:text-error"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <div className="mt-3 flex items-end justify-between">
                                        <div className="flex items-center rounded-full border border-outline px-2 py-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateQuantity(
                                                        storeSlug,
                                                        product.id,
                                                        quantity - 1,
                                                    )
                                                }
                                                className="p-1"
                                            >
                                                <Minus size={14} />
                                            </button>

                                            <span className="w-9 text-center text-sm font-semibold">
                                                {quantity}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateQuantity(
                                                        storeSlug,
                                                        product.id,
                                                        quantity + 1,
                                                        product.stock,
                                                    )
                                                }
                                                className="p-1"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>

                                        <p className="text-lg font-bold text-primary">
                                            RM{(product.price * quantity).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </section>

                    <section className="mx-5 mt-8 rounded-xl bg-surface-low p-6">
                        <h2 className="font-display text-xl text-primary">
                            Order Summary
                        </h2>

                        <div className="mt-5 space-y-3 text-sm text-on-surface-variant">
                            <div className="flex items-center justify-between">
                                <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
                                <span>RM{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Shipping</span>
                                <span className="font-semibold text-secondary">FREE</span>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-outline/60 pt-4">
                            <span className="font-display text-2xl">Total</span>
                            <span className="font-display text-2xl text-primary">
                                RM{subtotal.toFixed(2)}
                            </span>
                        </div>
                    </section>

                    <div className="px-5 py-4">
                        <Link
                            href={`/store/${storeSlug}/checkout`}
                            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-lg font-semibold text-white"
                        >
                            Proceed to Checkout ({itemCount})
                            <ArrowRight size={20} />
                        </Link>
                    </div>
                </>
            )}
        </main>
    );
}
