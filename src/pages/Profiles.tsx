import {
	createSignal,
	createResource,
	Show,
	For,
	onMount,
	onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { addToast, setActiveProfile } from "../stores/app";
import { Pencil, Trash2 } from "lucide-solid";
import { setStationValues, initStationDefaults } from "../stores/session";
import { on, emit, Events } from "../stores/events";
import Modal from "../components/shared/Modal";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import Card from "../components/shared/Card";
import type { Profile, CreateProfile } from "../types";
import { BANDS, MODES } from "../types";

const emptyProfile: CreateProfile = {
	callsign: "",
	name: "",
	grid: "",
	default_power: "",
	default_band: "",
	default_mode: "",
	default_park: "",
	default_summit: "",
	station_description: "",
};

export default function Profiles() {
	const [showModal, setShowModal] = createSignal(false);
	const [editing, setEditing] = createSignal<Profile | null>(null);
	const [form, setForm] = createSignal<CreateProfile>({ ...emptyProfile });

	const [profiles, { refetch }] = createResource(() =>
		invoke<Profile[]>("get_profiles"),
	);

	// Listen for external changes
	let unsub: (() => void) | undefined;
	onMount(() => {
		unsub = on(Events.PROFILES_CHANGED, refetch);
	});
	onCleanup(() => unsub?.());

	function openCreate() {
		setEditing(null);
		setForm({ ...emptyProfile });
		setShowModal(true);
	}

	function openEdit(p: Profile) {
		setEditing(p);
		setForm({
			callsign: p.callsign,
			name: p.name,
			grid: p.grid,
			default_power: p.default_power,
			default_band: p.default_band,
			default_mode: p.default_mode,
			default_park: p.default_park,
			default_summit: p.default_summit,
			station_description: p.station_description,
		});
		setShowModal(true);
	}

	function updateField<K extends keyof CreateProfile>(key: K, value: string) {
		setForm((prev) => ({ ...prev, [key]: value }));
	}

	async function saveProfile() {
		const f = form();
		if (!f.callsign.trim()) {
			addToast("Callsign is required", "error");
			return;
		}
		try {
			if (editing()) {
				await invoke("update_profile", {
					profile: { ...editing()!, ...f, callsign: f.callsign.toUpperCase() },
				});
				addToast(`Updated ${f.callsign.toUpperCase()}`, "success");
			} else {
				await invoke("create_profile", {
					profile: { ...f, callsign: f.callsign.toUpperCase() },
				});
				addToast(`Created ${f.callsign.toUpperCase()}`, "success");
			}
			setShowModal(false);
			refetch();
			emit(Events.PROFILES_CHANGED);
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		}
	}

	async function deleteProfile(id: number, callsign: string) {
		if (
			!(await confirm(`Delete profile "${callsign}"?`, {
				title: "Delete Profile",
				kind: "warning",
			}))
		)
			return;
		try {
			await invoke("delete_profile", { id });
			addToast(`Deleted ${callsign}`, "success");
			refetch();
			emit(Events.PROFILES_CHANGED);
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		}
	}

	async function activateProfile(p: Profile) {
		await invoke("set_active_profile", { id: p.id });
		setActiveProfile(p);
		setStationValues({});
		initStationDefaults({
			band: p.default_band,
			mode: p.default_mode,
			power: p.default_power,
			my_grid: p.grid,
			my_park: p.default_park,
			my_summit: p.default_summit,
		});
		addToast(`Active: ${p.callsign}`, "success");
		emit(Events.PROFILES_CHANGED);
	}

	return (
		<div>
			<PageHeader title="Profiles">
				<button class="btn btn-primary" onClick={openCreate}>
					+ New Profile
				</button>
			</PageHeader>

			<Show when={!profiles()?.length}>
				<EmptyState
					title="No Profiles"
					description="Create a profile with your callsign to get started."
				>
					<button class="btn btn-primary" onClick={openCreate}>
						+ Create Profile
					</button>
				</EmptyState>
			</Show>

			<div class="card-grid">
				<For each={profiles()}>
					{(p) => (
						<Card
							title={p.callsign}
							mono
							meta={`Grid: ${p.grid || "—"} · Power: ${p.default_power || "—"}W · ${p.default_band} ${p.default_mode}`}
							headerActions={
								<div class="card-actions">
									<button
										class="btn-icon"
										onClick={() => openEdit(p)}
										title="Edit"
									>
										<Pencil size={14} />
									</button>
									<button
										class="btn-icon"
										onClick={() => deleteProfile(p.id, p.callsign)}
										title="Delete"
									>
										<Trash2 size={14} />
									</button>
								</div>
							}
							actions={
								<button
									class="btn btn-primary btn-sm"
									onClick={() => activateProfile(p)}
								>
									Set Active
								</button>
							}
						>
							<div class="card-meta">{p.name}</div>
						</Card>
					)}
				</For>
			</div>

			<Modal
				open={showModal()}
				onClose={() => setShowModal(false)}
				title={editing() ? "Edit Profile" : "New Profile"}
			>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Callsign *</label>
						<input
							class="form-input callsign"
							type="text"
							value={form().callsign}
							onInput={(e) =>
								updateField("callsign", e.currentTarget.value.toUpperCase())
							}
							placeholder="W1ABC"
						/>
					</div>
					<div class="form-group">
						<label class="form-label">Name</label>
						<input
							class="form-input"
							type="text"
							value={form().name}
							onInput={(e) => updateField("name", e.currentTarget.value)}
						/>
					</div>
					<div class="form-group">
						<label class="form-label">Grid Square</label>
						<input
							class="form-input"
							type="text"
							value={form().grid}
							onInput={(e) =>
								updateField("grid", e.currentTarget.value.toUpperCase())
							}
							placeholder="FN31pr"
						/>
					</div>
					<div class="form-row">
						<div class="form-group">
							<label class="form-label">Default Power (W)</label>
							<input
								class="form-input"
								type="text"
								value={form().default_power}
								onInput={(e) =>
									updateField("default_power", e.currentTarget.value)
								}
								placeholder="100"
							/>
						</div>
						<div class="form-group">
							<label class="form-label">Default Band</label>
							<select
								class="form-select"
								value={form().default_band}
								onChange={(e) =>
									updateField("default_band", e.currentTarget.value)
								}
							>
								<option value="">—</option>
								<For each={BANDS}>{(b) => <option value={b}>{b}</option>}</For>
							</select>
						</div>
						<div class="form-group">
							<label class="form-label">Default Mode</label>
							<select
								class="form-select"
								value={form().default_mode}
								onChange={(e) =>
									updateField("default_mode", e.currentTarget.value)
								}
							>
								<option value="">—</option>
								<For each={MODES}>{(m) => <option value={m}>{m}</option>}</For>
							</select>
						</div>
					</div>
					<div class="form-row">
						<div class="form-group">
							<label class="form-label">Default Park</label>
							<input
								class="form-input"
								type="text"
								value={form().default_park}
								onInput={(e) =>
									updateField("default_park", e.currentTarget.value)
								}
								placeholder="K-1234"
							/>
						</div>
						<div class="form-group">
							<label class="form-label">Default Summit</label>
							<input
								class="form-input"
								type="text"
								value={form().default_summit}
								onInput={(e) =>
									updateField("default_summit", e.currentTarget.value)
								}
								placeholder="W4G/NG-001"
							/>
						</div>
					</div>
					<div class="form-group">
						<label class="form-label">Station Description</label>
						<input
							class="form-input"
							type="text"
							value={form().station_description}
							onInput={(e) =>
								updateField("station_description", e.currentTarget.value)
							}
							placeholder="IC-7300 + EFHW"
						/>
					</div>
				</div>
				<div class="modal-footer">
					<button class="btn btn-secondary" onClick={() => setShowModal(false)}>
						Cancel
					</button>
					<button class="btn btn-primary" onClick={saveProfile}>
						{editing() ? "Save" : "Create"}
					</button>
				</div>
			</Modal>
		</div>
	);
}
