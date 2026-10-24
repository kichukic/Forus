import { useCallback, useLayoutEffect, useRef } from 'react';

// A callback that keeps one identity for the component's whole life but always
// runs the latest version of `fn`. Handing these to memoized children lets them
// skip redrawing when the parent redraws. Not for calling during render.
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
