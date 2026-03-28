import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { addToast, theme, setTheme, syncInProgress } from "../stores/app";
import PageHeader from "../components/shared/PageHeader";
import type { SyncStatus, SyncProgress } from "../types";

export default function Settings() {
  const [manualSyncing, setManualSyncing] = createSignal<string | null>(null);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus | null>(null);
  const [progress, setProgress] = createSignal<SyncProgress | null>(null);

  const isBusy = () => manualSyncing() !== null || syncInProgress();

  let unlisten: (() => void) | null = null;

  onMount(async () => {
    try {
      const status = await invoke<SyncStatus>("get_sync_status");
      setSyncStatus(status);
    } catch (_) {}

    unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      setProgress(event.payload);
    });
  });

  onCleanup(() => {
    if (unlisten) unlisten();
  });

  async function loadSyncStatus() {
    try {
      const status = await invoke<SyncStatus>("get_sync_status");
      setSyncStatus(status);
    } catch (_) {}
  }

  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    setTheme(next as "light" | "dark");
  }

  async function syncPota() {
    setManualSyncing("pota");
    setProgress(null);
    try {
      const count = await invoke<number>("sync_pota_data");
      addToast(`Synced ${count.toLocaleString()} POTA parks`, "success");
      await loadSyncStatus();
    } catch (err) {
      addToast(`POTA sync failed: ${err}`, "error");
    }
    setManualSyncing(null);
    setProgress(null);
  }

  async function syncSota() {
    setManualSyncing("sota");
    setProgress(null);
    try {
      const count = await invoke<number>("sync_sota_data");
      addToast(`Synced ${count.toLocaleString()} SOTA summits`, "success");
      await loadSyncStatus();
    } catch (err) {
      addToast(`SOTA sync failed: ${err}`, "error");
    }
    setManualSyncing(null);
    setProgress(null);
  }

  function formatSyncDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "Never";
    return dateStr.replace("T", " ").replace("Z", " UTC");
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div class="card settings-card">
        <h3>Appearance</h3>
        <div class="settings-row">
          <button class="btn btn-secondary" onClick={toggleTheme}>Toggle Theme</button>
          <span class="settings-row-label">
            Current: {theme() === "dark" ? "Dark" : "Light"} mode
          </span>
        </div>
      </div>

      <div class="card settings-card">
        <h3>Reference Data</h3>
        <p>
          Download park/summit reference data for offline autocomplete. Syncs automatically in the background when data is older than 7 days.
        </p>

        <Show when={syncInProgress() && !manualSyncing()}>
          <div class="settings-bg-sync">
            Background sync in progress…
          </div>
        </Show>

        <div class="settings-stack">
          <div class="settings-sync-item">
            <button class="btn btn-secondary" onClick={syncPota} disabled={isBusy()}>
              {manualSyncing() === "pota" ? "Syncing…" : "Sync POTA Parks"}
            </button>
            <Show when={syncStatus()}>
              <span class="settings-sync-detail">
                {syncStatus()!.pota_count.toLocaleString()} parks · Last: {formatSyncDate(syncStatus()!.pota_last_synced)}
              </span>
            </Show>
          </div>

          <div class="settings-sync-item">
            <button class="btn btn-secondary" onClick={syncSota} disabled={isBusy()}>
              {manualSyncing() === "sota" ? "Syncing…" : "Sync SOTA Summits"}
            </button>
            <Show when={syncStatus()}>
              <span class="settings-sync-detail">
                {syncStatus()!.sota_count.toLocaleString()} summits · Last: {formatSyncDate(syncStatus()!.sota_last_synced)}
              </span>
            </Show>
          </div>

          <Show when={manualSyncing() && progress()}>
            <div class="settings-progress">
              <Show when={progress()!.total > 1}>
                [{progress()!.current}/{progress()!.total}]{" "}
              </Show>
              {progress()!.label}
            </div>
          </Show>
        </div>
      </div>

      <div class="card settings-card">
        <h3>About LogRS</h3>
        <p>Amateur radio logging application built with Tauri, Solid.js, and Rust.</p>
        <p class="settings-sync-detail" style={{ "margin-top": "4px" }}>Version 0.1.0</p>
      </div>
    </div>
  );
}
