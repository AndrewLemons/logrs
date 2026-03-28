import { createSignal } from "solid-js";
import type { Profile, Logbook, Template } from "../types";

// Active profile
const [activeProfile, setActiveProfile] = createSignal<Profile | null>(null);
export { activeProfile, setActiveProfile };

// Active logbook
const [activeLogbook, setActiveLogbook] = createSignal<Logbook | null>(null);
export { activeLogbook, setActiveLogbook };

// Active template (resolved from active logbook)
const [activeTemplate, setActiveTemplate] = createSignal<Template | null>(null);
export { activeTemplate, setActiveTemplate };

// Theme
export type Theme = "light" | "dark" | "system";
const [theme, setTheme] = createSignal<Theme>("system");
export { theme, setTheme };

// Toast notifications
export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}
const [toasts, setToasts] = createSignal<Toast[]>([]);
let toastId = 0;

export function addToast(message: string, type: Toast["type"] = "info") {
  const id = ++toastId;
  setToasts((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}

export { toasts };

// Background sync state
const [syncInProgress, setSyncInProgress] = createSignal(false);
export { syncInProgress, setSyncInProgress };
