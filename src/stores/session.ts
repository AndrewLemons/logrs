import { createSignal } from "solid-js";

// Generic key-value store for station-level field values (persistent across QSOs)
const [stationValues, setStationValues] = createSignal<Record<string, string>>(
	{},
);
export { stationValues, setStationValues };

// Fields that the radio integration can drive automatically. Once the user
// manually edits one of these, it's marked "overridden" and radio updates
// stop touching it until the override is released (see clearRadioOverride).
const RADIO_FIELDS = new Set(["band", "mode", "frequency"]);

const [radioOverrides, setRadioOverrides] = createSignal<Record<string, boolean>>(
	{},
);
export { radioOverrides };

// Whether the radio integration currently has a live connection. Used to
// decide whether to show the "live" indicator on band/mode/frequency.
const [radioConnected, setRadioConnected] = createSignal(false);
export { radioConnected, setRadioConnected };

export function isRadioLive(key: string): boolean {
	return radioConnected() && RADIO_FIELDS.has(key) && !radioOverrides()[key];
}

export function isRadioOverridden(key: string): boolean {
	return radioConnected() && RADIO_FIELDS.has(key) && !!radioOverrides()[key];
}

export function setStationField(key: string, value: string) {
	setStationValues((prev) => ({ ...prev, [key]: value }));
	if (RADIO_FIELDS.has(key)) {
		setRadioOverrides((prev) => ({ ...prev, [key]: true }));
	}
}

/** Applies a value coming from the radio integration; a no-op for fields the user has overridden. */
export function setStationFieldFromRadio(key: string, value: string) {
	if (radioOverrides()[key]) return;
	setStationValues((prev) => ({ ...prev, [key]: value }));
}

export function clearRadioOverride(key: string) {
	setRadioOverrides((prev) => ({ ...prev, [key]: false }));
}

export function getStationField(key: string): string {
	return stationValues()[key] ?? "";
}

export function initStationDefaults(defaults: Record<string, string>) {
	setStationValues((prev) => {
		const merged = { ...prev };
		for (const [key, value] of Object.entries(defaults)) {
			if (!merged[key]) merged[key] = value;
		}
		return merged;
	});
	// A new profile's defaults should let the radio take over again.
	setRadioOverrides({});
}
