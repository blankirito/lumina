"use client";

import {
    createContext,
    useContext,
    useCallback,
    useMemo,
} from "react";
import { useLocalStorageState } from "@/components/state/useLocalStorageState";
import {
    addStorefrontCartItemWithinStock,
    type StorefrontCartLine,
    updateStorefrontCartQuantity,
} from "@/lib/storefront/storefrontCart";

type StorefrontCartContextValue = {
    items: StorefrontCartLine[];
    isReady: boolean;
    addItem: (
        storeSlug: string,
        productId: string,
        quantity: number,
        availableStock: number,
    ) => void;

    updateQuantity: (
        storeSlug: string,
        productId: string,
        quantity: number,
        availableStock?: number,
    ) => void;
    getItemsForStore: (storeSlug: string) => StorefrontCartLine[];
    getItemCountForStore: (storeSlug: string) => number;
};

const StorefrontCartContext =
    createContext<StorefrontCartContextValue | null>(null);

const STORAGE_KEY = "lumina-storefront-cart";

const EMPTY_ITEMS: StorefrontCartLine[] = [];

export function StorefrontCartProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { value: items, setValue: setItems, isReady } = useLocalStorageState(
        STORAGE_KEY,
        EMPTY_ITEMS,
        true,
    );

    const addItem = useCallback((
        storeSlug: string,
        productId: string,
        quantity: number,
        availableStock: number,
    ) => {
        setItems((currentItems) =>
            addStorefrontCartItemWithinStock(
                currentItems,
                {
                    storeSlug,
                    productId,
                    quantity,
                },
                availableStock,
            ),
        );
    }, [setItems]);

    const updateQuantity = useCallback((
        storeSlug: string,
        productId: string,
        quantity: number,
        availableStock?: number,
    ) => {
        const safeQuantity =
            availableStock === undefined
                ? quantity
                : Math.min(quantity, availableStock);

        setItems((currentItems) =>
            updateStorefrontCartQuantity(
                currentItems,
                storeSlug,
                productId,
                safeQuantity,
            ),
        );
    }, [setItems]);

    const getItemsForStore = useCallback((storeSlug: string) => {
        return items.filter((item) => item.storeSlug === storeSlug);
    }, [items]);

    const getItemCountForStore = useCallback((storeSlug: string) => {
        return getItemsForStore(storeSlug).reduce(
            (total, item) => total + item.quantity,
            0,
        );
    }, [getItemsForStore]);

    const value = useMemo(
        () => ({
            items,
            isReady,
            addItem,
            updateQuantity,
            getItemsForStore,
            getItemCountForStore,
        }),
        [
            items, isReady, addItem, updateQuantity,
            getItemsForStore, getItemCountForStore,
        ],
    );

    return (
        <StorefrontCartContext.Provider value={value}>
            {children}
        </StorefrontCartContext.Provider>
    );
}

export function useStorefrontCart() {
    const context = useContext(StorefrontCartContext);

    if (!context) {
        throw new Error(
            "useStorefrontCart must be used inside StorefrontCartProvider.",
        );
    }

    return context;
}