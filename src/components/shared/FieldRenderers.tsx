import { For } from "solid-js";
import type { TemplateField } from "../../types";
import ParkAutocomplete from "./ParkAutocomplete";

interface StationFieldProps {
	field: TemplateField;
	value: string;
	onChange: (value: string) => void;
	onSelectGrid?: (grid: string) => void;
}

/** Renders a station-level field (compact inline style for station bar) */
export function StationField(props: StationFieldProps) {
	if (props.field.type === "dropdown" && props.field.options) {
		return (
			<div class="station-field">
				<label class="station-field-label">{props.field.label}</label>
				<select
					class="station-field-input"
					value={props.value}
					onChange={(e) => props.onChange(e.currentTarget.value)}
				>
					<option value="">—</option>
					<For each={props.field.options}>
						{(opt) => <option value={opt}>{opt}</option>}
					</For>
				</select>
			</div>
		);
	}
	if (props.field.type === "lookup" && props.field.lookup) {
		return (
			<div class="station-field">
				<label class="station-field-label">{props.field.label}</label>
				<ParkAutocomplete
					value={props.value}
					onChange={props.onChange}
					lookup={props.field.lookup}
					placeholder={props.field.default ?? ""}
					class="station-field-input"
					onSelectGrid={props.onSelectGrid}
				/>
			</div>
		);
	}
	return (
		<div class="station-field">
			<label class="station-field-label">{props.field.label}</label>
			<input
				class="station-field-input"
				type="text"
				value={props.value}
				onInput={(e) => props.onChange(e.currentTarget.value)}
				placeholder={props.field.default ?? ""}
			/>
		</div>
	);
}

interface QsoFieldProps {
	field: TemplateField;
	value: string;
	onChange: (value: string) => void;
	ref?: (el: HTMLInputElement) => void;
	onBlur?: () => void;
	lookupStatus?: "idle" | "loading" | "found" | "not-found";
	onSelectGrid?: (grid: string) => void;
}

/** Renders a QSO-level field (form style for QSO entry panel) */
export function QsoField(props: QsoFieldProps) {
	if (props.field.id === "callsign") {
		return (
			<div class="form-group">
				<label class="form-label">Callsign</label>
				<input
					ref={props.ref}
					class="form-input callsign"
					type="text"
					value={props.value}
					onInput={(e) => props.onChange(e.currentTarget.value.toUpperCase())}
					onBlur={props.onBlur}
					placeholder="W1ABC"
					autocomplete="off"
					spellcheck={false}
				/>
				{props.lookupStatus && props.lookupStatus !== "idle" && (
					<div class="lookup-status">
						{props.lookupStatus === "loading" && (
							<>
								<span class="spin">⟳</span> Looking up...
							</>
						)}
						{props.lookupStatus === "found" && (
							<>
								<span class="status-dot success" /> Found
							</>
						)}
						{props.lookupStatus === "not-found" && (
							<>
								<span class="status-dot error" /> Not found
							</>
						)}
					</div>
				)}
			</div>
		);
	}

	if (props.field.type === "dropdown" && props.field.options) {
		return (
			<div class="form-group">
				<label class="form-label">{props.field.label}</label>
				<select
					class="form-select"
					value={props.value}
					onChange={(e) => props.onChange(e.currentTarget.value)}
				>
					<option value="">—</option>
					<For each={props.field.options}>
						{(opt) => <option value={opt}>{opt}</option>}
					</For>
				</select>
			</div>
		);
	}

	if (props.field.type === "lookup" && props.field.lookup) {
		return (
			<div class="form-group">
				<label class="form-label">{props.field.label}</label>
				<ParkAutocomplete
					value={props.value}
					onChange={props.onChange}
					lookup={props.field.lookup}
					placeholder={props.field.default ?? ""}
					class="form-input"
					onSelectGrid={props.onSelectGrid}
				/>
			</div>
		);
	}

	return (
		<div class="form-group">
			<label class="form-label">{props.field.label}</label>
			<input
				class="form-input"
				type="text"
				value={props.value}
				onInput={(e) => props.onChange(e.currentTarget.value)}
				placeholder={props.field.default ?? ""}
			/>
		</div>
	);
}
