import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { addToast, syncInProgress } from "../stores/app";
import PageHeader from "../components/shared/PageHeader";
import type { SyncStatus, SyncProgress } from "../types";

export default function Settings() {
  const [manualSyncing, setManualSyncing] = createSignal<string | null>(null);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus | null>(null);
  const [progress, setProgress] = createSignal<SyncProgress | null>(null);

  // QRZ credentials
  const [qrzUsername, setQrzUsername] = createSignal("");
  const [qrzPassword, setQrzPassword] = createSignal("");
  const [qrzTesting, setQrzTesting] = createSignal(false);
  const [qrzSaving, setQrzSaving] = createSignal(false);
  const [qrzStatus, setQrzStatus] = createSignal<"idle" | "ok" | "error">("idle");

  const isBusy = () => manualSyncing() !== null || syncInProgress();

  let unlisten: (() => void) | null = null;

  onMount(async () => {
    try {
      const status = await invoke<SyncStatus>("get_sync_status");
      setSyncStatus(status);
    } catch (_) {}

    // Load QRZ credentials
    try {
      const [u, p] = await invoke<[string, string]>("get_qrz_credentials_cmd");
      setQrzUsername(u);
      setQrzPassword(p);
      if (u && p) setQrzStatus("ok");
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
        <h3>Callsign Lookup</h3>
        <p>
          Configure QRZ.com credentials for enhanced callsign lookups with state, country, CQ zone, and ITU zone data. Falls back to HamDB when QRZ is unavailable.
        </p>
        <div class="settings-stack" style={{ "margin-top": "var(--space-md)" }}>
          <div class="form-group">
            <label class="form-label">QRZ Username</label>
            <input
              class="form-input settings-qrz-input"
              type="text"
              value={qrzUsername()}
              onInput={(e) => { setQrzUsername(e.currentTarget.value); setQrzStatus("idle"); }}
              placeholder="Callsign"
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label class="form-label">QRZ Password</label>
            <input
              class="form-input settings-qrz-input"
              type="password"
              value={qrzPassword()}
              onInput={(e) => { setQrzPassword(e.currentTarget.value); setQrzStatus("idle"); }}
              placeholder="Password"
              autocomplete="current-password"
            />
          </div>
          <div class="settings-row">
            <button
              class="btn btn-secondary btn-sm"
              disabled={qrzTesting() || !qrzUsername() || !qrzPassword()}
              onClick={async () => {
                setQrzTesting(true);
                try {
                  await invoke("test_qrz_credentials", { username: qrzUsername(), password: qrzPassword() });
                  setQrzStatus("ok");
                  addToast("QRZ credentials verified", "success");
                } catch (err) {
                  setQrzStatus("error");
                  addToast(`QRZ login failed: ${err}`, "error");
                }
                setQrzTesting(false);
              }}
            >
              {qrzTesting() ? "Testing…" : "Test Connection"}
            </button>
            <button
              class="btn btn-primary btn-sm"
              disabled={qrzSaving() || !qrzUsername() || !qrzPassword()}
              onClick={async () => {
                setQrzSaving(true);
                try {
                  await invoke("set_qrz_credentials", { username: qrzUsername(), password: qrzPassword() });
                  addToast("QRZ credentials saved", "success");
                  setQrzStatus("ok");
                } catch (err) {
                  addToast(`Error saving credentials: ${err}`, "error");
                }
                setQrzSaving(false);
              }}
            >
              {qrzSaving() ? "Saving…" : "Save"}
            </button>
            <Show when={qrzStatus() === "ok"}>
              <span class="settings-qrz-status ok">Connected</span>
            </Show>
            <Show when={qrzStatus() === "error"}>
              <span class="settings-qrz-status error">Login failed</span>
            </Show>
          </div>
          <p class="settings-sync-detail">
            Without QRZ credentials, lookups use HamDB (name, grid, state, country only).
          </p>
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
