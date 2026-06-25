import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { addToast, syncInProgress } from "../stores/app";
import PageHeader from "../components/shared/PageHeader";
import type {
	SyncStatus,
	SyncProgress,
	RadioSettings,
	RadioSnapshot,
	RadioTestResult,
} from "../types";

export default function Settings() {
	const [manualSyncing, setManualSyncing] = createSignal<string | null>(null);
	const [syncStatus, setSyncStatus] = createSignal<SyncStatus | null>(null);
	const [progress, setProgress] = createSignal<SyncProgress | null>(null);

	// QRZ credentials
	const [qrzUsername, setQrzUsername] = createSignal("");
	const [qrzPassword, setQrzPassword] = createSignal("");
	const [qrzTesting, setQrzTesting] = createSignal(false);
	const [qrzSaving, setQrzSaving] = createSignal(false);
	const [qrzStatus, setQrzStatus] = createSignal<"idle" | "ok" | "error">(
		"idle",
	);

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

		await loadRadioSettings();
		unlistenRadioSettings = await listen<RadioSnapshot>(
			"radio-update",
			(event) => {
				setRadioSnapshot(event.payload);
			},
		);
	});

	onCleanup(() => {
		if (unlisten) unlisten();
		if (unlistenRadioSettings) unlistenRadioSettings();
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

	// Radio integration (Hamlib rigctld)
	const [radioEnabled, setRadioEnabled] = createSignal(false);
	const [radioHost, setRadioHost] = createSignal("127.0.0.1");
	const [radioPort, setRadioPort] = createSignal("4532");
	const [radioSaving, setRadioSaving] = createSignal(false);
	const [radioTesting, setRadioTesting] = createSignal(false);
	const [radioTestResult, setRadioTestResult] = createSignal<RadioTestResult | null>(
		null,
	);
	const [radioTestError, setRadioTestError] = createSignal<string | null>(null);
	const [radioSnapshot, setRadioSnapshot] = createSignal<RadioSnapshot | null>(
		null,
	);

	let unlistenRadioSettings: (() => void) | null = null;

	async function loadRadioSettings() {
		try {
			const settings = await invoke<RadioSettings>("get_radio_settings");
			setRadioEnabled(settings.enabled);
			setRadioHost(settings.host);
			setRadioPort(String(settings.port));
		} catch (_) {}
		try {
			const snap = await invoke<RadioSnapshot>("get_radio_snapshot");
			setRadioSnapshot(snap);
		} catch (_) {}
	}

	async function saveRadioSettings() {
		setRadioSaving(true);
		try {
			await invoke("set_radio_settings", {
				settings: {
					enabled: radioEnabled(),
					host: radioHost(),
					port: parseInt(radioPort()) || 4532,
				},
			});
			addToast("Radio settings saved", "success");
		} catch (err) {
			addToast(`Error saving radio settings: ${err}`, "error");
		}
		setRadioSaving(false);
	}

	async function testRadioConnection() {
		setRadioTesting(true);
		setRadioTestResult(null);
		setRadioTestError(null);
		try {
			const result = await invoke<RadioTestResult>("test_radio_connection", {
				host: radioHost(),
				port: parseInt(radioPort()) || 4532,
			});
			setRadioTestResult(result);
		} catch (err) {
			setRadioTestError(String(err));
		}
		setRadioTesting(false);
	}

	function radioStatusLabel(status: RadioSnapshot["status"] | undefined): string {
		switch (status) {
			case "connected":
				return "Connected";
			case "connecting":
				return "Connecting…";
			case "disconnected":
				return "Disconnected";
			default:
				return "Disabled";
		}
	}

	function formatFrequency(hz: number | null | undefined): string {
		if (hz == null) return "—";
		return (hz / 1_000_000).toFixed(6) + " MHz";
	}

	return (
		<div>
			<PageHeader title="Settings" />

			<div class="card settings-card">
				<h3>Callsign Lookup</h3>
				<p>
					Configure QRZ.com credentials for enhanced callsign lookups with
					state, country, CQ zone, and ITU zone data. Falls back to HamDB when
					QRZ is unavailable.
				</p>
				<div class="settings-stack" style={{ "margin-top": "var(--space-md)" }}>
					<div class="form-group">
						<label class="form-label">QRZ Username</label>
						<input
							class="form-input settings-qrz-input"
							type="text"
							value={qrzUsername()}
							onInput={(e) => {
								setQrzUsername(e.currentTarget.value);
								setQrzStatus("idle");
							}}
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
							onInput={(e) => {
								setQrzPassword(e.currentTarget.value);
								setQrzStatus("idle");
							}}
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
									await invoke("test_qrz_credentials", {
										username: qrzUsername(),
										password: qrzPassword(),
									});
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
									await invoke("set_qrz_credentials", {
										username: qrzUsername(),
										password: qrzPassword(),
									});
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
						Without QRZ credentials, lookups use HamDB (name, grid, state,
						country only).
					</p>
				</div>
			</div>

			<div class="card settings-card">
				<h3>Reference Data</h3>
				<p>
					Download park/summit reference data for offline autocomplete. Syncs
					automatically in the background when data is older than 7 days.
				</p>

				<Show when={syncInProgress() && !manualSyncing()}>
					<div class="settings-bg-sync">Background sync in progress…</div>
				</Show>

				<div class="settings-stack">
					<div class="settings-sync-item">
						<button
							class="btn btn-secondary"
							onClick={syncPota}
							disabled={isBusy()}
						>
							{manualSyncing() === "pota" ? "Syncing…" : "Sync POTA Parks"}
						</button>
						<Show when={syncStatus()}>
							<span class="settings-sync-detail">
								{syncStatus()!.pota_count.toLocaleString()} parks · Last:{" "}
								{formatSyncDate(syncStatus()!.pota_last_synced)}
							</span>
						</Show>
					</div>

					<div class="settings-sync-item">
						<button
							class="btn btn-secondary"
							onClick={syncSota}
							disabled={isBusy()}
						>
							{manualSyncing() === "sota" ? "Syncing…" : "Sync SOTA Summits"}
						</button>
						<Show when={syncStatus()}>
							<span class="settings-sync-detail">
								{syncStatus()!.sota_count.toLocaleString()} summits · Last:{" "}
								{formatSyncDate(syncStatus()!.sota_last_synced)}
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
				<h3>Radio Integration</h3>
				<p>
					Automatically fill in frequency, band, and mode from your
					transceiver via Hamlib's <code>rigctld</code>. Manually edited
					fields are left alone until released back to the radio.
				</p>
				<div class="settings-stack" style={{ "margin-top": "var(--space-md)" }}>
					<div class="form-group">
						<label class="form-label settings-checkbox-label">
							<input
								type="checkbox"
								checked={radioEnabled()}
								onChange={(e) => setRadioEnabled(e.currentTarget.checked)}
							/>
							Enable Radio Integration
						</label>
					</div>
					<div class="form-group">
						<label class="form-label">Host</label>
						<input
							class="form-input settings-radio-input"
							type="text"
							value={radioHost()}
							onInput={(e) => setRadioHost(e.currentTarget.value)}
							placeholder="127.0.0.1"
						/>
					</div>
					<div class="form-group">
						<label class="form-label">Port</label>
						<input
							class="form-input settings-radio-input"
							type="text"
							value={radioPort()}
							onInput={(e) => setRadioPort(e.currentTarget.value)}
							placeholder="4532"
						/>
					</div>
					<div class="settings-row">
						<button
							class="btn btn-secondary btn-sm"
							type="button"
							disabled={radioTesting() || !radioHost() || !radioPort()}
							onClick={testRadioConnection}
						>
							{radioTesting() ? "Testing…" : "Test Connection"}
						</button>
						<button
							class="btn btn-primary btn-sm"
							type="button"
							disabled={radioSaving()}
							onClick={saveRadioSettings}
						>
							{radioSaving() ? "Saving…" : "Save"}
						</button>
						<Show when={radioEnabled()}>
							<span class="settings-row">
								<span
									class={`status-dot ${
										radioSnapshot()?.status === "connected"
											? "success"
											: radioSnapshot()?.status === "connecting"
												? "warning"
												: "error"
									}`}
								/>
								{radioStatusLabel(radioSnapshot()?.status)}
							</span>
						</Show>
					</div>

					<Show when={radioTestResult()}>
						<p class="settings-sync-detail">
							Detected: {formatFrequency(radioTestResult()!.frequency_hz)}
							{radioTestResult()!.band ? ` (${radioTestResult()!.band})` : ""}
							{radioTestResult()!.mode ? ` · ${radioTestResult()!.mode}` : ""}
						</p>
					</Show>
					<Show when={radioTestError()}>
						<p class="settings-sync-detail" style={{ color: "var(--color-error)" }}>
							Connection failed: {radioTestError()}
						</p>
					</Show>

					<Show when={radioEnabled() && radioSnapshot()?.status === "connected"}>
						<p class="settings-sync-detail">
							Current Radio: {formatFrequency(radioSnapshot()?.frequency_hz)}
							{radioSnapshot()?.band ? ` (${radioSnapshot()?.band})` : ""}
							{radioSnapshot()?.mode ? ` · ${radioSnapshot()?.mode}` : " · mode unknown (digital sub-mode)"}
						</p>
					</Show>
				</div>
			</div>

			<div class="card settings-card">
				<h3>About LogRS</h3>
				<p>
					Amateur radio logging application built with Tauri, Solid.js, and
					Rust.
				</p>
				<p class="settings-sync-detail" style={{ "margin-top": "4px" }}>
					Version 0.1.0
				</p>
			</div>
		</div>
	);
}
