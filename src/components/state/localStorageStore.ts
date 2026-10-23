type Snapshot<T> = { value: T; isReady: boolean };

// Each mounted consumer owns its store; nothing mutable is shared across SSR requests.
export function createLocalStorageStore<T>(
  key: string,
  initialValue: T,
  persistInEffect = false,
) {
  const serverSnapshot: Snapshot<T> = { value: initialValue, isReady: false };
  let snapshot = serverSnapshot;
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function initialize() {
    if (snapshot.isReady) return;
    let value = initialValue;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) value = JSON.parse(saved) as T;
    } catch {
      window.localStorage.removeItem(key);
    }
    snapshot = { value, isReady: true };
  }

  return {
    getSnapshot: () => snapshot,
    // React uses this exact empty state for SSR and the first hydration render.
    getServerSnapshot: () => serverSnapshot,
    persist() {
      if (snapshot.isReady) {
        window.localStorage.setItem(key, JSON.stringify(snapshot.value));
      }
    },
    subscribe(listener: () => void) {
      initialize();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setValue(update: T | ((current: T) => T)) {
      initialize();
      const value = typeof update === "function"
        ? (update as (current: T) => T)(snapshot.value)
        : update;
      snapshot = { value, isReady: true };
      try {
        if (!persistInEffect) {
          window.localStorage.setItem(key, JSON.stringify(value));
        }
      } finally {
        emit();
      }
    },
    clear() {
      snapshot = { value: initialValue, isReady: true };
      try {
        window.localStorage.removeItem(key);
      } finally {
        emit();
      }
    },
  };
}
