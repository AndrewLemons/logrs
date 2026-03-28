import { type ParentProps, onMount, onCleanup, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles/index.css";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import { toasts, setActiveProfile, setActiveLogbook, setActiveTemplate, setTheme, addToast, setSyncInProgress } from "./stores/app";
import { initStationDefaults } from "./stores/session";
import type { Profile, Logbook, Template } from "./types";

function App(props: ParentProps) {
  let unlistenSyncStarted: (() => void) | undefined;
  let unlistenSyncCompleted: (() => void) | undefined;

  onMount(async () => {
    // Apply theme
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
    setTheme(prefersDark ? "dark" : "light");

    // Load active profile
    try {
      const profile = await invoke<Profile | null>("get_active_profile");
      if (profile) {
        setActiveProfile(profile);
        initStationDefaults({
          band: profile.default_band,
          mode: profile.default_mode,
          power: profile.default_power,
          my_grid: profile.grid,
          my_park: profile.default_park,
          my_summit: profile.default_summit,
        });
      }
    } catch (_) { /* no active profile yet */ }

    // Load active logbook
    try {
      const logbook = await invoke<Logbook | null>("get_active_logbook");
      if (logbook) {
        setActiveLogbook(logbook);
        const template = await invoke<Template>("get_template", { id: logbook.template_id });
        setActiveTemplate(template);
      }
    } catch (_) { /* no active logbook yet */ }

    // Listen for background sync events
    unlistenSyncStarted = await listen("background-sync-started", () => {
      setSyncInProgress(true);
      addToast("Syncing reference data in background…", "info");
    });
    unlistenSyncCompleted = await listen("background-sync-completed", () => {
      setSyncInProgress(false);
      addToast("Reference data sync complete", "success");
    });
  });

  onCleanup(() => {
    unlistenSyncStarted?.();
    unlistenSyncCompleted?.();
  });

  return (
    <div class="app-layout">
      <Sidebar />
      <div class="app-main">
        <TopBar />
        <div class="app-content">{props.children}</div>
      </div>
      <div class="toast-container">
        <For each={toasts()}>
          {(toast) => <div class={`toast ${toast.type}`}>{toast.message}</div>}
        </For>
      </div>
    </div>
  );
}

export default App;
