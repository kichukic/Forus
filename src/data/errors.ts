// A crash that takes the app down with it is the worst kind of bug: the user
// sees the app close and nothing else. React Native's own handler re-throws
// the error, which ends the process. This one catches it instead and shows it
// on screen, so the app stays open and the error can be read off it.

declare const __DEV__: boolean;

type Listener = (error: Error, isFatal: boolean) => void;

const listeners = new Set<Listener>();
let installed = false;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Something went wrong.');
  }
}

/** Tells whoever is listening that an error happened. */
export function reportError(value: unknown, isFatal: boolean) {
  const error = toError(value);
  console.error(error);
  for (const listener of listeners) {
    try {
      listener(error, isFatal);
    } catch {
      // A listener that fails must not stop the others.
    }
  }
}

/** Starts listening for errors. Returns the function that stops listening. */
export function subscribeErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

/**
 * Whether this is a development build. Metro defines __DEV__, but it is not
 * defined everywhere, so it is asked for carefully.
 */
function isDevBuild(): boolean {
  try {
    return typeof __DEV__ !== 'undefined' && !!__DEV__;
  } catch {
    return false;
  }
}

/**
 * Takes over React Native's error handler, once, before anything else can
 * fail. Without this, an error that reaches the top ends the process and the
 * app simply closes.
 */
export function installErrorHandler() {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const dev = isDevBuild();
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, !!isFatal);
    // While developing, the red box says more than anything here could show,
    // so it still gets its turn. In a built app the usual handler ends the
    // process, which is the very thing this is here to stop.
    if (!dev && isFatal) return;
    try {
      previous(error, isFatal);
    } catch {
      // The old handler may throw; that is what we are here to avoid.
    }
  });
}
