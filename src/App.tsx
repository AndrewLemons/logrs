import { type ParentProps, onMount, onCleanup, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles/index.css";
import Sidebar from "./components/layout/Sidebar";
import {
	toasts,
	setActiveProfile,
	setActiveLogbook,
	setActiveTemplate,
	addToast,
	setSyncInProgress,
} from "./stores/app";
import {
	initStationDefaults,
	setRadioConnected,
	setStationFieldFromRadio,
} from "./stores/session";
import type { Profile, Logbook, Template, RadioSnapshot } from "./types";

function App(props: ParentProps) {
	let unlistenSyncStarted: (() => void) | undefined;
	let unlistenSyncCompleted: (() => void) | undefined;
	let unlistenRadio: (() => void) | undefined;

	onMount(async () => {
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
		} catch (_) {
			/* no active profile yet */
		}

		// Load active logbook
		try {
			const logbook = await invoke<Logbook | null>("get_active_logbook");
			if (logbook) {
				setActiveLogbook(logbook);
				const template = await invoke<Template>("get_template", {
					id: logbook.template_id,
				});
				setActiveTemplate(template);
			}
		} catch (_) {
			/* no active logbook yet */
		}

		// Listen for background sync events
		unlistenSyncStarted = await listen("background-sync-started", () => {
			setSyncInProgress(true);
			addToast("Syncing reference data in background…", "info");
		});
		unlistenSyncCompleted = await listen("background-sync-completed", () => {
			setSyncInProgress(false);
			addToast("Reference data sync complete", "success");
		});

		// Live updates from the radio integration (see src-tauri/src/radio).
		// Fields the user has manually overridden are left alone — see
		// setStationFieldFromRadio in stores/session.ts.
		try {
			const snap = await invoke<RadioSnapshot>("get_radio_snapshot");
			setRadioConnected(snap.status === "connected");
			if (snap.status === "connected") {
				if (snap.frequency_hz != null) {
					setStationFieldFromRadio("frequency", String(snap.frequency_hz));
				}
				if (snap.band) setStationFieldFromRadio("band", snap.band);
				if (snap.mode) setStationFieldFromRadio("mode", snap.mode);
			}
		} catch (_) {
			/* radio integration unavailable */
		}
		unlistenRadio = await listen<RadioSnapshot>("radio-update", (event) => {
			const snap = event.payload;
			setRadioConnected(snap.status === "connected");
			if (snap.status !== "connected") return;
			if (snap.frequency_hz != null) {
				setStationFieldFromRadio("frequency", String(snap.frequency_hz));
			}
			if (snap.band) setStationFieldFromRadio("band", snap.band);
			if (snap.mode) setStationFieldFromRadio("mode", snap.mode);
		});
	});

	onCleanup(() => {
		unlistenSyncStarted?.();
		unlistenSyncCompleted?.();
		unlistenRadio?.();
	});

	return (
		<div class="app-layout">
			<Sidebar />
			<div class="app-main">
				<div class="app-drag-region" data-tauri-drag-region />
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
