// A tiny toast bus, shared by every feature that wants to say something
// without blocking the screen. One toast at a time; a new one replaces the
// old one.
import { useState, useEffect } from 'react';

export type ToastAction = { label: string; onPress: () => void };

export type Toast = {
  text: string;
  icon?: string;
  action?: ToastAction;
  duration?: number;
};

type Listener = (toast: Toast | null) => void;
const listeners = new Set<Listener>();
let current: Toast | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(toast: Toast) {
  if (hideTimer) clearTimeout(hideTimer);
  current = toast;
  listeners.forEach((fn) => fn(current));
  hideTimer = setTimeout(() => {
    current = null;
    listeners.forEach((fn) => fn(null));
  }, toast.duration ?? 4500);
}

export function hideToast() {
  if (hideTimer) clearTimeout(hideTimer);
  current = null;
  listeners.forEach((fn) => fn(null));
}

export function useToast(): Toast | null {
  const [toast, setToast] = useState<Toast | null>(current);
  useEffect(() => {
    const fn: Listener = (t) => setToast(t);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return toast;
}
