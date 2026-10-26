// 01-barograph · a one-bit presentation flag: while the browser demo shows the
// "Automatic memory · synthetic preview", the record strip drops its demo-week
// chart (that chart belongs to the Vault demo, not to the preview's own paper).
// It holds no data, is never persisted and has no effect outside the browser demo.
import { useSyncExternalStore } from 'react';

let on = false;
const subscribers = new Set<() => void>();
export const setAutoMode = (next: boolean) => { if (on !== next) { on = next; subscribers.forEach((f) => f()); } };
export const useAutoMode = () => useSyncExternalStore((cb) => { subscribers.add(cb); return () => { subscribers.delete(cb); }; }, () => on, () => false);
