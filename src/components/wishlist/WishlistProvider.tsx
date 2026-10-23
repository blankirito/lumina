"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { useLocalStorageState } from "@/components/state/useLocalStorageState";

type WishlistContextValue = {
  productIds: number[];
  isReady: boolean;
  hasItem: (productId: number) => boolean;
  toggleItem: (productId: number) => void;
  removeItem: (productId: number) => void;
};

const WishlistContext = createContext<WishlistContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "lumina-wishlist";

const EMPTY_ITEMS: number[] = [];

export function WishlistProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { value: productIds, setValue: setProductIds, isReady } = useLocalStorageState(
    STORAGE_KEY, EMPTY_ITEMS, true,
  );

  const hasItem = useCallback((productId: number) => {
    return productIds.includes(productId);
  }, [productIds]);

  const toggleItem = useCallback((productId: number) => {
    setProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }, [setProductIds]);

  const removeItem = useCallback((productId: number) => {
    setProductIds((current) => current.filter((id) => id !== productId));
  }, [setProductIds]);

  const value = useMemo(
    () => ({
      productIds,
      isReady,
      hasItem,
      toggleItem,
      removeItem,
    }),
    [productIds, isReady, hasItem, toggleItem, removeItem],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);

  if (!context) {
    throw new Error("useWishlist must be used inside WishlistProvider.");
  }

  return context;
}