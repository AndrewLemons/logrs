import { createSignal, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { addToast, activeLogbook, activeProfile } from "../../stores/app";
import { getStationField } from "../../stores/session";
import { QsoField } from "../shared/FieldRenderers";
import { AlertTriangle } from "lucide-solid";
import type {
	TemplateDef,
	TemplateField,
	CallsignInfo,
	PotaSpotResult,
	Qso,
} from "../../types";
import { parseQsoData } from "../../types";

interface QsoEntryFormProps {
	qsoFields: TemplateField[];
	templateDef: TemplateDef | null;
	qsoValues: Record<string, string>;
	setQsoValues: (
		fn: (prev: Record<string, string>) => Record<string, string>,
	) => void;
	onSaved: () => void;
	totalQsos: number;
}

export default function QsoEntryForm(props: QsoEntryFormProps) {
	const [lookupStatus, setLookupStatus] = createSignal<
		"idle" | "loading" | "found" | "not-found"
	>("idle");
	const [isDuplicate, setIsDuplicate] = createSignal(false);
	const [saving, setSaving] = createSignal(false);

	let callsignRef: HTMLInputElement | undefined;

	// In-flight lookup promises — stored so saveQso can reuse them for retroactive patching
	// rather than firing duplicate network requests.
	let pendingCallsignInfo: Promise<CallsignInfo | null> | undefined;
	let pendingPotaSpot: Promise<PotaSpotResult | null> | undefined;

	// Tracks which fields were populated by lookups (not typed by the user).
	// These are cleared automatically when the callsign changes.
	const autoFilledFields = new Set<string>();

	function getQsoValue(id: string): string {
		return props.qsoValues[id] ?? "";
	}

	function setQsoValue(id: string, value: string) {
		props.setQsoValues((prev) => ({ ...prev, [id]: value }));
	}

	/** Set a value that came from a lookup — tracked so it can be cleared on callsign change. */
	function setAutoFilledValue(id: string, value: string) {
		autoFilledFields.add(id);
		setQsoValue(id, value);
	}

	/** Called when the callsign input changes — clears stale auto-filled data. */
	function onCallsignChange(value: string) {
		const prevCs = (props.qsoValues.callsign ?? "").trim().toUpperCase();
		const nextCs = value.trim().toUpperCase();
		if (nextCs !== prevCs && autoFilledFields.size > 0) {
			const toClear = new Set(autoFilledFields);
			autoFilledFields.clear();
			props.setQsoValues((p) => {
				const next = { ...p };
				toClear.forEach((id) => {
					next[id] = "";
				});
				return next;
			});
			setLookupStatus("idle");
			setIsDuplicate(false);
			// Abandon in-flight lookups for the old callsign
			pendingCallsignInfo = undefined;
			pendingPotaSpot = undefined;
		}
		setQsoValue("callsign", value.toUpperCase());
	}

	/** Called when any non-callsign field changes — if the user edits an auto-filled
	 *  field, it becomes user-owned and won't be wiped on a future callsign change. */
	function onQsoFieldChange(id: string, value: string) {
		autoFilledFields.delete(id);
		setQsoValue(id, value);
	}

	/** Retroactively patch a saved QSO with auto-filled fields.
	 *  Only updates fields that were empty at save time (user-entered values are never overwritten). */
	async function patchQsoBg(
		savedQso: Qso,
		patches: Record<string, string>,
	): Promise<void> {
		const data = parseQsoData(savedQso);
		const updates: Record<string, string> = {};
		for (const [key, val] of Object.entries(patches)) {
			if (val && !data[key]) updates[key] = val;
		}
		if (Object.keys(updates).length === 0) return;
		try {
			await invoke("update_qso", {
				qso: {
					...savedQso,
					data_json: JSON.stringify({ ...data, ...updates }),
				},
			});
			props.onSaved();
		} catch {
			// Background patch is best-effort; don't surface errors to the user
		}
	}

	function doLookup() {
		const cs = (props.qsoValues.callsign ?? "").trim().toUpperCase();
		if (cs.length < 3) return;
		setLookupStatus("loading");

		// --- Callsign info lookup ---
		pendingCallsignInfo = invoke<CallsignInfo | null>("lookup_callsign", {
			callsign: cs,
		}).catch(() => null);

		// Update current form fields when lookup resolves.
		// Guard: skip if callsign has changed (e.g. QSO was saved and form was reset).
		pendingCallsignInfo.then((info) => {
			const currentCs = (props.qsoValues.callsign ?? "").trim().toUpperCase();
			if (currentCs !== cs) return;
			if (info) {
				setLookupStatus("found");
				// Fill if empty OR if the value was auto-filled by a previous lookup (overwrite with fresh data).
				if (
					info.name &&
					(autoFilledFields.has("name") || !props.qsoValues.name)
				)
					setAutoFilledValue("name", info.name);
				if (
					info.grid &&
					(autoFilledFields.has("their_grid") || !props.qsoValues.their_grid)
				)
					setAutoFilledValue("their_grid", info.grid);
				if (
					info.state &&
					(autoFilledFields.has("state") || !props.qsoValues.state)
				)
					setAutoFilledValue("state", info.state);
				if (
					info.country &&
					(autoFilledFields.has("country") || !props.qsoValues.country)
				)
					setAutoFilledValue("country", info.country);
				if (
					info.cq_zone &&
					(autoFilledFields.has("cq_zone") || !props.qsoValues.cq_zone)
				)
					setAutoFilledValue("cq_zone", info.cq_zone);
				if (
					info.itu_zone &&
					(autoFilledFields.has("itu_zone") || !props.qsoValues.itu_zone)
				)
					setAutoFilledValue("itu_zone", info.itu_zone);
			} else {
				setLookupStatus("not-found");
			}
		});

		// --- POTA activator lookup (if template has "their_park") ---
		const hasTheirPark = props.templateDef?.fields.some(
			(f) => f.id === "their_park",
		);
		if (hasTheirPark) {
			pendingPotaSpot = invoke<PotaSpotResult | null>("lookup_pota_activator", {
				callsign: cs,
			}).catch(() => null);

			pendingPotaSpot.then((spot) => {
				const currentCs = (props.qsoValues.callsign ?? "").trim().toUpperCase();
				if (currentCs !== cs) return;
				if (
					spot?.reference &&
					(autoFilledFields.has("their_park") || !props.qsoValues.their_park)
				) {
					setAutoFilledValue("their_park", spot.reference);
				}
			});
		}

		// --- Duplicate check ---
		const logbook = activeLogbook();
		const band = getStationField("band");
		if (logbook && band) {
			invoke<boolean>("check_duplicate", {
				logbookId: logbook.id,
				callsign: cs,
				band,
			})
				.then((dup) => setIsDuplicate(dup))
				.catch(() => setIsDuplicate(false));
		}
	}

	async function saveQso(e?: Event) {
		e?.preventDefault();
		const logbook = activeLogbook();
		if (!activeProfile()) {
			addToast("Select a profile first", "error");
			return;
		}
		if (!logbook) {
			addToast("Select a logbook first", "error");
			return;
		}
		const cs = (props.qsoValues.callsign ?? "").trim().toUpperCase();
		if (!cs) {
			addToast("Enter a callsign", "error");
			callsignRef?.focus();
			return;
		}

		setSaving(true);
		try {
			const allData: Record<string, string> = {};
			const tmpl = props.templateDef;
			if (tmpl) {
				for (const f of tmpl.fields) {
					if (f.category === "station") {
						allData[f.id] = getStationField(f.id);
					} else {
						allData[f.id] = props.qsoValues[f.id] ?? f.default ?? "";
					}
				}
			}
			allData.callsign = cs;

			const savedQso = await invoke<Qso>("create_qso", {
				qso: {
					logbook_id: logbook.id,
					data_json: JSON.stringify(allData),
				},
			});
			addToast(`Logged ${cs}`, "success");

			// Reset form immediately — don't wait for background lookups
			const defaults: Record<string, string> = {};
			for (const f of props.qsoFields) {
				defaults[f.id] = f.default ?? "";
			}
			props.setQsoValues(() => defaults);
			autoFilledFields.clear();
			setLookupStatus("idle");
			setIsDuplicate(false);
			props.onSaved();
			callsignRef?.focus();

			// --- Background enrichment ---
			// Reuse in-flight promises (already started on blur) so there are no duplicate
			// requests. Falls back to a fresh invoke if the user saved without blurring.
			const callsignPromise =
				pendingCallsignInfo ??
				invoke<CallsignInfo | null>("lookup_callsign", { callsign: cs }).catch(
					() => null,
				);

			const hasTheirPark = props.templateDef?.fields.some(
				(f) => f.id === "their_park",
			);
			const potaPromise: Promise<PotaSpotResult | null> = hasTheirPark
				? (pendingPotaSpot ??
					invoke<PotaSpotResult | null>("lookup_pota_activator", {
						callsign: cs,
					}).catch(() => null))
				: Promise.resolve(null);

			// Clear refs — next QSO starts with clean state
			pendingCallsignInfo = undefined;
			pendingPotaSpot = undefined;

			// Wait for both concurrently, then apply a single atomic patch
			Promise.all([callsignPromise, potaPromise]).then(([info, spot]) => {
				const patches: Record<string, string> = {};
				if (info?.name) patches.name = info.name;
				if (info?.grid) patches.their_grid = info.grid;
				if (info?.state) patches.state = info.state;
				if (info?.country) patches.country = info.country;
				if (info?.cq_zone) patches.cq_zone = info.cq_zone;
				if (info?.itu_zone) patches.itu_zone = info.itu_zone;
				if (spot?.reference) patches.their_park = spot.reference;
				if (Object.keys(patches).length > 0) patchQsoBg(savedQso, patches);
			});
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form class="qso-entry" onSubmit={saveQso}>
			<For each={props.qsoFields.filter((f) => f.id === "callsign")}>
				{(field) => (
					<QsoField
						field={field}
						value={getQsoValue(field.id)}
						onChange={onCallsignChange}
						ref={(el) => {
							callsignRef = el;
						}}
						onBlur={doLookup}
						lookupStatus={lookupStatus()}
					/>
				)}
			</For>

			<Show when={isDuplicate()}>
				<div class="duplicate-warning">
					<AlertTriangle size={14} /> Possible duplicate — same callsign + band
					in the last 30 minutes
				</div>
			</Show>

			<div class="qso-entry-fields">
				<For each={props.qsoFields.filter((f) => f.id !== "callsign")}>
					{(field) => (
						<QsoField
							field={field}
							value={getQsoValue(field.id)}
							onChange={(v) => onQsoFieldChange(field.id, v)}
							onSelectGrid={
								field.id === "their_park" || field.id === "their_summit"
									? (grid) => onQsoFieldChange("their_grid", grid)
									: undefined
							}
						/>
					)}
				</For>
			</div>

			<div class="qso-entry-actions">
				<button class="btn btn-primary" type="submit" disabled={saving()}>
					{saving() ? "Saving..." : "Log QSO"}
				</button>
				<span class="qso-count">{props.totalQsos} QSOs logged</span>
			</div>
		</form>
	);
}
