"use client";

import { useMemo, useState } from "react";
import { useLocalStorageState } from "@/components/state/useLocalStorageState";
import SearchBar from "@/components/search/SearchBar";
import RecentSearch from "@/components/search/RecentSearch";
import PopularCategory from "@/components/search/PopularCategory";
import StorefrontNavbar from "@/components/storefront/StorefrontNavbar";
import StorefrontProductCard from "@/components/storefront/StorefrontProductCard";
import { filterStorefrontProducts } from "@/lib/storefront/filterStorefrontProducts";
import type { StorefrontProduct } from "@/lib/storefront/storefrontProduct";

type StorefrontSearchClientProps = {
  storeName: string;
  storeSlug: string;
  products: StorefrontProduct[];
};

const EMPTY_SEARCHES: string[] = [];

export default function StorefrontSearchClient({
  storeName,
  storeSlug,
  products,
}: StorefrontSearchClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const storageKey = `lumina-recent-searches:${storeSlug}`;
  const { value: recentSearches, setValue: setRecentSearches, clear: clearSearches } =
    useLocalStorageState(storageKey, EMPTY_SEARCHES);

  function saveSearch(value: string) {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return;
    }

    setRecentSearches((current) => {
      const nextSearches = [
        trimmedValue,
        ...current.filter(
          (item) => item.toLowerCase() !== trimmedValue.toLowerCase(),
        ),
      ].slice(0, 5);

      return nextSearches;
    });
  }

  const filteredProducts = useMemo(
    () => filterStorefrontProducts(products, searchQuery),
    [products, searchQuery],
  );

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].slice(0, 4),
    [products],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <main className="min-h-screen pb-24">
      <StorefrontNavbar storeName={storeName} homeHref={`/store/${storeSlug}`} />

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        onSubmit={() => saveSearch(searchQuery)}
      />

      {!hasSearchQuery && (
        <>
          <RecentSearch
            searches={recentSearches}
            onSelect={setSearchQuery}
            onClear={clearSearches}
          />

          <PopularCategory
            categories={categories}
            onSelect={setSearchQuery}
          />
        </>
      )}

      {hasSearchQuery && (
        <section className="mt-10 px-5">
          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl bg-surface-low p-8 text-center">
              <h2 className="font-display text-2xl text-primary">
                No products found
              </h2>

              <p className="mt-2 text-sm text-on-surface-variant">
                We could not find anything for “{searchQuery.trim()}”.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-on-surface-variant">
                {filteredProducts.length} product
                {filteredProducts.length === 1 ? "" : "s"} found
              </p>

              <div className="grid grid-cols-2 gap-4">
                {filteredProducts.map((product) => (
                  <StorefrontProductCard
                    key={product.id}
                    storeSlug={storeSlug}
                    product={product}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
