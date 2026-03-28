import { createSignal } from "solid-js";

// Generic key-value store for station-level field values (persistent across QSOs)
const [stationValues, setStationValues] = createSignal<Record<string, string>>(
	{},
);
export { stationValues, setStationValues };

export function setStationField(key: string, value: string) {
	setStationValues((prev) => ({ ...prev, [key]: value }));
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
}
