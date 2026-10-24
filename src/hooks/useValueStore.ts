import { useState, useSyncExternalStore, type ReactNode } from 'react';

// A value that changes often (a player's clock) kept outside React state, so
// only the components that show it redraw when it changes, not the whole screen.
export type ValueStore<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
};

function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A store that lives as long as the component. */
export function useValueStore<T>(initial: T): ValueStore<T> {
  const [store] = useState(() => createValueStore(initial));
  return store;
}

/** Draws `children` with the store's current value, redrawing only this part. */
export function StoreValue<T>({ store, children }: { store: ValueStore<T>; children: (value: T) => ReactNode }) {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return children(value);
}
