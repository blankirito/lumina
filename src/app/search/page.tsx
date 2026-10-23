"use client";

import { useMemo, useState } from "react";
import Navbar2 from "@/components/shared/Navbar2";
import { useLocalStorageState } from "@/components/state/useLocalStorageState";
import SearchBar from "@/components/search/SearchBar";
import RecentSearch from "@/components/search/RecentSearch";
import PopularCategory from "@/components/search/PopularCategory";
import SearchProductGrid from "@/components/search/SearchProductGrid";
import { products } from "@/data/products";

const STORAGE_KEY = "lumina-recent-searches";

const EMPTY_SEARCHES: string[] = [];

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { value: recentSearches, setValue: setRecentSearches, clear: clearSearches } =
    useLocalStorageState(STORAGE_KEY, EMPTY_SEARCHES);

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

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.category,
        product.description,
        ...product.features,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [searchQuery]);

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <main className="pb-24">
      <Navbar2 />

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

          <PopularCategory onSelect={setSearchQuery} />
        </>
      )}

      {hasSearchQuery && (
        <SearchProductGrid
          products={filteredProducts}
          searchQuery={searchQuery}
        />
      )}
    </main>
  );
}