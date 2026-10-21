import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useLocalStorageState } from "./useLocalStorageState";
import { createLocalStorageStore } from "./localStorageStore";

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

const EMPTY_ITEMS: number[] = [];

function StoredItems() {
  const { value, isReady } = useLocalStorageState("cart", EMPTY_ITEMS, true);
  return createElement("output", null, JSON.stringify({ value, isReady }));
}

describe("persisted client state", () => {
  it("server-renders without touching browser storage", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Browser-only API"); } });
    expect(renderToString(createElement(StoredItems))).toBe(
      '<output>{&quot;value&quot;:[],&quot;isReady&quot;:false}</output>',
    );
  });

  it("notifies subscribers of updates and stops after unsubscribe", () => {
    installStorage();
    const store = createLocalStorageStore<number[]>("cart", []);
    const observations: number[][] = [];
    const unsubscribe = store.subscribe(() => observations.push(store.getSnapshot().value));
    store.setValue([7]);
    store.clear();
    unsubscribe();
    store.setValue([9]);
    expect(observations).toEqual([[7], []]);
  });

  it("finishes successful checkout cleanup before a cart persistence failure", () => {
    const storage = installStorage({ cart: '["first", "second"]' });
    const store = createLocalStorageStore<string[]>("cart", [], true);
    store.subscribe(() => {});
    storage.setItem = () => { throw new Error("Quota exceeded"); };
    let checkoutStatus = "submitting";
    try {
      for (const id of ["first", "second"]) {
        store.setValue((items) => items.filter((item) => item !== id));
      }
      checkoutStatus = "success";
    } catch {
      checkoutStatus = "error";
    }
    expect(checkoutStatus).toBe("success");
    expect(store.getSnapshot().value).toEqual([]);
    expect(() => store.persist()).toThrow("Quota exceeded");
    expect(checkoutStatus).toBe("success");
  });

  it("preserves in-memory edits and surfaces a failed write", () => {
    const storage = installStorage();
    const store = createLocalStorageStore<number[]>("cart", []);
    store.subscribe(() => {});
    storage.setItem = () => { throw new Error("Quota exceeded"); };
    expect(() => store.setValue([7])).toThrow("Quota exceeded");
    expect(store.getSnapshot().value).toEqual([7]);
    expect(storage.getItem("cart")).toBeNull();
  });
  it("keeps SSR empty and hydrates saved data without overwriting it", () => {
    const storage = installStorage({ cart: "[7,8]" });
    const store = createLocalStorageStore<number[]>("cart", [], true);
    expect(store.getServerSnapshot()).toEqual({ value: [], isReady: false });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toEqual({ value: [7, 8], isReady: true });
    expect(storage.getItem("cart")).toBe("[7,8]");
    expect(store.getServerSnapshot()).toEqual({ value: [], isReady: false });
    unsubscribe();
  });

  it("applies consecutive functional updates to the latest saved value", () => {
    const storage = installStorage({ cart: "[7]" });
    const store = createLocalStorageStore<number[]>("cart", []);
    store.subscribe(() => {});
    store.setValue((value) => [...value, 8]);
    store.setValue((value) => [...value, 9]);
    expect(store.getSnapshot().value).toEqual([7, 8, 9]);
    expect(storage.getItem("cart")).toBe("[7,8,9]");
  });

  it("isolates store keys and removes cleared search history", () => {
    const storage = installStorage({ "search:a": '["rose"]', "search:b": '["soap"]' });
    const a = createLocalStorageStore<string[]>("search:a", []);
    const b = createLocalStorageStore<string[]>("search:b", []);
    a.subscribe(() => {});
    b.subscribe(() => {});
    a.clear();
    expect(a.getSnapshot().value).toEqual([]);
    expect(storage.getItem("search:a")).toBeNull();
    expect(b.getSnapshot().value).toEqual(["soap"]);
    expect(storage.getItem("search:b")).toBe('["soap"]');
  });

  it("recovers malformed JSON without retaining another store's data", () => {
    const storage = installStorage({ broken: "{" });
    const store = createLocalStorageStore<string[]>("broken", []);
    store.subscribe(() => {});
    expect(store.getSnapshot()).toEqual({ value: [], isReady: true });
    expect(storage.getItem("broken")).toBeNull();
  });

  it("does not create empty history on mount, but initializes a missing cart", () => {
    const storage = installStorage();
    createLocalStorageStore<string[]>("history", []).subscribe(() => {});
    const cart = createLocalStorageStore<number[]>("cart", [], true);
    cart.subscribe(() => {});
    cart.persist();
    expect(storage.getItem("history")).toBeNull();
    expect(storage.getItem("cart")).toBe("[]");
  });

  it("does not reread or lose in-memory changes when Strict Mode resubscribes", () => {
    installStorage({ cart: "[7]" });
    const store = createLocalStorageStore<number[]>("cart", []);
    const unsubscribe = store.subscribe(() => {});
    store.setValue([8]);
    unsubscribe();
    store.subscribe(() => {});
    expect(store.getSnapshot().value).toEqual([8]);
  });

  it("surfaces unavailable storage instead of silently claiming persistence", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Storage denied"); } });
    const store = createLocalStorageStore<number[]>("cart", []);
    expect(() => store.subscribe(() => {})).toThrow("Storage denied");
  });
});
