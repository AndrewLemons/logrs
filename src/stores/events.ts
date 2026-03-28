/** Simple typed event bus to replace (window as any).__refetchXxx hacks */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function on(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event: string) {
  listeners.get(event)?.forEach((fn) => fn());
}

// Well-known event names
export const Events = {
  LOGBOOKS_CHANGED: "logbooks:changed",
  PROFILES_CHANGED: "profiles:changed",
} as const;
