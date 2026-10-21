"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createLocalStorageStore } from "./localStorageStore";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  persistInEffect = false,
) {
  const store = useMemo(
    () => createLocalStorageStore(key, initialValue, persistInEffect),
    [key, initialValue, persistInEffect],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  // Cart/wishlist persistence stays outside event handlers, so a storage failure
  // cannot turn an already committed checkout into a submission error.
  useEffect(() => {
    if (persistInEffect && snapshot.isReady) store.persist();
  }, [persistInEffect, snapshot, store]);

  return { ...snapshot, setValue: store.setValue, clear: store.clear };
}
