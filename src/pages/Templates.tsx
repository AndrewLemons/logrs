import { createSignal, createResource, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { addToast, activeTemplate, setActiveTemplate } from "../stores/app";
import { AVAILABLE_FIELDS, BANDS, MODES } from "../types";
import type {
	Template,
	TemplateDef,
	TemplateField,
	FieldCategory,
	CompetitionConfig,
} from "../types";
import { COMPETITION_PRESETS } from "../utils/competition";
import type { CompetitionPreset } from "../utils/competition";
import Modal from "../components/shared/Modal";
import PageHeader from "../components/shared/PageHeader";
import Card from "../components/shared/Card";

export default function Templates() {
	const [templates, { refetch }] = createResource(() =>
		invoke<Template[]>("get_templates"),
	);
	const [editing, setEditing] = createSignal<Template | null>(null);
	const [creating, setCreating] = createSignal(false);

	// Template editor state
	const [name, setName] = createSignal("");
	const [fields, setFields] = createSignal<TemplateField[]>([]);
	const [competitionEnabled, setCompetitionEnabled] = createSignal(false);
	const [competitionConfig, setCompetitionConfig] =
		createSignal<CompetitionConfig | null>(null);

	function openNew() {
		setName("");
		setFields([
			{
				id: "callsign",
				label: "Callsign",
				type: "text",
				category: "qso",
				required: true,
				persistent: false,
				show_in_table: true,
			},
			{
				id: "rst_sent",
				label: "RST Sent",
				type: "text",
				category: "qso",
				required: false,
				persistent: false,
				show_in_table: true,
				default: "59",
			},
			{
				id: "rst_recv",
				label: "RST Recv",
				type: "text",
				category: "qso",
				required: false,
				persistent: false,
				show_in_table: true,
				default: "59",
			},
			{
				id: "band",
				label: "Band",
				type: "dropdown",
				category: "station",
				required: true,
				persistent: true,
				show_in_table: true,
				options: BANDS,
			},
			{
				id: "mode",
				label: "Mode",
				type: "dropdown",
				category: "station",
				required: true,
				persistent: true,
				show_in_table: true,
				options: MODES,
			},
			{
				id: "frequency",
				label: "Frequency",
				type: "text",
				category: "station",
				required: false,
				persistent: true,
				show_in_table: true,
			},
		]);
		setCompetitionEnabled(false);
		setCompetitionConfig(null);
		setCreating(true);
		setEditing(null);
	}

	function openEdit(t: Template) {
		setName(t.name);
		try {
			const def: TemplateDef = JSON.parse(t.json_definition);
			setFields([...def.fields]);
			if (def.competition?.enabled) {
				setCompetitionEnabled(true);
				setCompetitionConfig({ ...def.competition });
			} else {
				setCompetitionEnabled(false);
				setCompetitionConfig(null);
			}
		} catch {
			setFields([]);
			setCompetitionEnabled(false);
			setCompetitionConfig(null);
		}
		setEditing(t);
		setCreating(false);
	}

	function closeEditor() {
		setEditing(null);
		setCreating(false);
		setCompetitionEnabled(false);
		setCompetitionConfig(null);
	}

	function isFieldIncluded(id: string) {
		return fields().some((f) => f.id === id);
	}

	function toggleField(avail: (typeof AVAILABLE_FIELDS)[number]) {
		if (isFieldIncluded(avail.id)) {
			setFields((prev) => prev.filter((f) => f.id !== avail.id));
		} else {
			const newField: TemplateField = {
				id: avail.id,
				label: avail.label,
				type: avail.type,
				category: avail.category,
				required: avail.id === "callsign",
				persistent: avail.category === "station",
				show_in_table: true,
				...(avail.default ? { default: avail.default } : {}),
				...(avail.options ? { options: avail.options } : {}),
				...(avail.lookup ? { lookup: avail.lookup } : {}),
			};
			setFields((prev) => [...prev, newField]);
		}
	}

	function moveField(idx: number, dir: -1 | 1) {
		const arr = [...fields()];
		const newIdx = idx + dir;
		if (newIdx < 0 || newIdx >= arr.length) return;
		[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
		setFields(arr);
	}

	function updateField(idx: number, updates: Partial<TemplateField>) {
		setFields((prev) =>
			prev.map((f, i) => (i === idx ? { ...f, ...updates } : f)),
		);
	}

	function applyPreset(preset: CompetitionPreset) {
		setCompetitionConfig({ ...preset.config });
		// Auto-add required fields if missing
		for (const fieldId of preset.required_fields) {
			if (!fields().some((f) => f.id === fieldId)) {
				const avail = AVAILABLE_FIELDS.find((a) => a.id === fieldId);
				if (avail) {
					setFields((prev) => [
						...prev,
						{
							id: avail.id,
							label: avail.label,
							type: avail.type,
							category: avail.category,
							required: false,
							persistent: false,
							show_in_table: true,
							...(avail.default ? { default: avail.default } : {}),
							...(avail.options ? { options: avail.options } : {}),
						},
					]);
				}
			}
		}
	}

	function updateCompetition(updates: Partial<CompetitionConfig>) {
		setCompetitionConfig((prev) => (prev ? { ...prev, ...updates } : null));
	}

	function updateScoring(updates: Partial<CompetitionConfig["scoring"]>) {
		setCompetitionConfig((prev) =>
			prev ? { ...prev, scoring: { ...prev.scoring, ...updates } } : null,
		);
	}

	function updateMultipliers(
		updates: Partial<CompetitionConfig["multipliers"]>,
	) {
		setCompetitionConfig((prev) =>
			prev
				? { ...prev, multipliers: { ...prev.multipliers, ...updates } }
				: null,
		);
	}

	async function saveTemplate() {
		const n = name().trim();
		if (!n) {
			addToast("Enter a template name", "error");
			return;
		}
		if (fields().length === 0) {
			addToast("Add at least one field", "error");
			return;
		}
		const def: TemplateDef = { fields: fields() };
		if (competitionEnabled() && competitionConfig()) {
			def.competition = competitionConfig()!;
		}
		const jsonDef = JSON.stringify(def);

		try {
			if (editing()) {
				await invoke("update_template", {
					template: {
						id: editing()!.id,
						name: n,
						json_definition: jsonDef,
						is_builtin: editing()!.is_builtin,
					},
				});
				addToast("Template updated", "success");
				if (activeTemplate()?.id === editing()!.id) {
					const updated = await invoke<Template>("get_template", {
						id: editing()!.id,
					});
					setActiveTemplate(updated);
				}
			} else {
				await invoke("create_template", {
					template: { name: n, json_definition: jsonDef },
				});
				addToast("Template created", "success");
			}
			closeEditor();
			refetch();
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		}
	}

	async function deleteTemplate(t: Template) {
		if (!confirm(`Delete template "${t.name}"?`)) return;
		try {
			await invoke("delete_template", { id: t.id });
			addToast("Template deleted", "success");
			refetch();
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		}
	}

	const fieldGroups = () => {
		const groups: Record<string, typeof AVAILABLE_FIELDS> = {};
		for (const f of AVAILABLE_FIELDS) {
			if (!groups[f.group]) groups[f.group] = [];
			groups[f.group].push(f);
		}
		return groups;
	};

	function getFieldCount(t: Template): number {
		try {
			const def: TemplateDef = JSON.parse(t.json_definition);
			return def.fields.length;
		} catch {
			return 0;
		}
	}

	const showEditor = () => creating() || editing() !== null;

	return (
		<div>
			<PageHeader title="Templates">
				<button class="btn btn-primary" onClick={openNew}>
					+ New Template
				</button>
			</PageHeader>

			<div class="card-grid">
				<For each={templates()}>
					{(t) => (
						<Card
							title={t.name}
							meta={`${getFieldCount(t)} fields`}
							headerActions={
								<Show when={t.is_builtin}>
									<span class="badge">Built-in</span>
								</Show>
							}
							actions={
								<div class="card-actions">
									<button
										class="btn btn-secondary btn-sm"
										onClick={() => openEdit(t)}
									>
										Edit
									</button>
									<Show when={!t.is_builtin}>
										<button
											class="btn btn-danger btn-sm"
											onClick={() => deleteTemplate(t)}
										>
											Delete
										</button>
									</Show>
								</div>
							}
						/>
					)}
				</For>
			</div>

			<Show when={showEditor()}>
				<Modal
					open={true}
					title={editing() ? `Edit: ${editing()!.name}` : "New Template"}
					onClose={closeEditor}
				>
					<div class="template-editor">
						<div class="form-group">
							<label class="form-label">Template Name</label>
							<input
								class="form-input"
								type="text"
								value={name()}
								onInput={(e) => setName(e.currentTarget.value)}
								placeholder="My Template"
							/>
						</div>

						<div class="template-editor-section">
							<h3>Available Fields</h3>
							<p class="template-editor-hint">
								Toggle fields to include in this template
							</p>
							<For each={Object.entries(fieldGroups())}>
								{([group, groupFields]) => (
									<div class="field-group">
										<div class="field-group-label">{group}</div>
										<div class="field-toggles">
											<For each={groupFields}>
												{(af) => (
													<label
														class={`field-toggle ${isFieldIncluded(af.id) ? "active" : ""}`}
													>
														<input
															type="checkbox"
															checked={isFieldIncluded(af.id)}
															onChange={() => toggleField(af)}
														/>
														{af.label}
													</label>
												)}
											</For>
										</div>
									</div>
								)}
							</For>
						</div>

						<Show when={fields().length > 0}>
							<div class="template-editor-section">
								<h3>Field Configuration</h3>
								<p class="template-editor-hint">
									Configure order, category, and visibility
								</p>
								<div class="field-config-list">
									<For each={fields()}>
										{(field, idx) => (
											<div class="field-config-item">
												<div class="field-config-order">
													<button
														class="btn-icon"
														onClick={() => moveField(idx(), -1)}
														disabled={idx() === 0}
														title="Move up"
													>
														▲
													</button>
													<button
														class="btn-icon"
														onClick={() => moveField(idx(), 1)}
														disabled={idx() === fields().length - 1}
														title="Move down"
													>
														▼
													</button>
												</div>
												<div class="field-config-name">{field.label}</div>
												<select
													class="form-select field-config-select"
													value={field.category}
													onChange={(e) =>
														updateField(idx(), {
															category: e.currentTarget.value as FieldCategory,
														})
													}
												>
													<option value="station">Station</option>
													<option value="qso">QSO</option>
												</select>
												<label class="field-config-check" title="Required">
													<input
														type="checkbox"
														checked={field.required}
														onChange={(e) =>
															updateField(idx(), {
																required: e.currentTarget.checked,
															})
														}
													/>
													Req
												</label>
												<label class="field-config-check" title="Show in table">
													<input
														type="checkbox"
														checked={field.show_in_table}
														onChange={(e) =>
															updateField(idx(), {
																show_in_table: e.currentTarget.checked,
															})
														}
													/>
													Table
												</label>
												<input
													class="form-input field-config-default"
													type="text"
													placeholder="Default"
													value={field.default ?? ""}
													onInput={(e) =>
														updateField(idx(), {
															default: e.currentTarget.value || undefined,
														})
													}
												/>
											</div>
										)}
									</For>
								</div>
							</div>
						</Show>

						<Show when={fields().length > 0}>
							<div class="template-editor-section">
								<h3>Competition Mode</h3>
								<p class="template-editor-hint">
									Enable competition tracking for this template
								</p>

								<label
									class="field-toggle competition-toggle"
									classList={{ active: competitionEnabled() }}
								>
									<input
										type="checkbox"
										checked={competitionEnabled()}
										onChange={(e) => {
											const enabled = e.currentTarget.checked;
											setCompetitionEnabled(enabled);
											if (enabled && !competitionConfig()) {
												// Default to first preset
												applyPreset(COMPETITION_PRESETS[0]);
											} else if (!enabled) {
												setCompetitionConfig(null);
											}
										}}
									/>
									Enable Competition Mode
								</label>

								<Show when={competitionEnabled() && competitionConfig()}>
									<div class="competition-config">
										<div class="form-group">
											<label class="form-label">Preset</label>
											<select
												class="form-select"
												value={
													COMPETITION_PRESETS.find(
														(p) => p.config.name === competitionConfig()?.name,
													)?.id ?? "custom"
												}
												onChange={(e) => {
													const preset = COMPETITION_PRESETS.find(
														(p) => p.id === e.currentTarget.value,
													);
													if (preset) applyPreset(preset);
												}}
											>
												<For each={COMPETITION_PRESETS}>
													{(p) => <option value={p.id}>{p.name}</option>}
												</For>
												<option value="custom">Custom</option>
											</select>
										</div>

										<div class="form-group">
											<label class="form-label">Competition Name</label>
											<input
												class="form-input"
												type="text"
												value={competitionConfig()!.name}
												onInput={(e) =>
													updateCompetition({ name: e.currentTarget.value })
												}
											/>
										</div>

										<div class="competition-config-row">
											<div class="form-group">
												<label class="form-label">Points per QSO</label>
												<input
													class="form-input"
													type="number"
													min="0"
													value={competitionConfig()!.scoring.points_per_qso}
													onInput={(e) =>
														updateScoring({
															points_per_qso:
																Number(e.currentTarget.value) || 0,
														})
													}
												/>
											</div>
											<div class="form-group">
												<label class="form-label">
													Bonus per New Multiplier
												</label>
												<input
													class="form-input"
													type="number"
													min="0"
													value={
														competitionConfig()!.scoring
															.bonus_per_new_multiplier
													}
													onInput={(e) =>
														updateScoring({
															bonus_per_new_multiplier:
																Number(e.currentTarget.value) || 0,
														})
													}
												/>
											</div>
										</div>

										<div class="competition-config-row">
											<label class="field-config-check">
												<input
													type="checkbox"
													checked={
														competitionConfig()!.scoring.use_band_multipliers
													}
													onChange={(e) =>
														updateScoring({
															use_band_multipliers: e.currentTarget.checked,
														})
													}
												/>
												Count per band (each band = separate multiplier)
											</label>
											<label class="field-config-check">
												<input
													type="checkbox"
													checked={
														competitionConfig()!.scoring.use_mode_multipliers
													}
													onChange={(e) =>
														updateScoring({
															use_mode_multipliers: e.currentTarget.checked,
														})
													}
												/>
												Count per mode
											</label>
										</div>

										<div class="competition-config-row">
											<div class="form-group">
												<label class="form-label">Multiplier Field</label>
												<select
													class="form-select"
													value={competitionConfig()!.multipliers.field}
													onChange={(e) =>
														updateMultipliers({ field: e.currentTarget.value })
													}
												>
													<For
														each={fields().filter((f) => f.category === "qso")}
													>
														{(f) => <option value={f.id}>{f.label}</option>}
													</For>
												</select>
											</div>
											<div class="form-group">
												<label class="form-label">Grid Columns</label>
												<input
													class="form-input"
													type="number"
													min="1"
													max="20"
													value={competitionConfig()!.multipliers.grid_columns}
													onInput={(e) =>
														updateMultipliers({
															grid_columns: Number(e.currentTarget.value) || 5,
														})
													}
												/>
											</div>
										</div>

										<div class="competition-mult-preview">
											<span class="form-label">
												{competitionConfig()!.multipliers.values.length}{" "}
												multiplier values defined
											</span>
										</div>
									</div>
								</Show>
							</div>
						</Show>

						<Show when={fields().length > 0}>
							<div class="template-editor-section">
								<h3>Preview</h3>
								<div class="template-preview">
									<div class="preview-group">
										<span class="preview-group-label">Station Bar:</span>
										<For
											each={fields().filter((f) => f.category === "station")}
										>
											{(f) => (
												<span class="preview-chip station">{f.label}</span>
											)}
										</For>
										<Show
											when={
												fields().filter((f) => f.category === "station")
													.length === 0
											}
										>
											<span class="settings-sync-detail">
												No station fields
											</span>
										</Show>
									</div>
									<div class="preview-group">
										<span class="preview-group-label">QSO Entry:</span>
										<For each={fields().filter((f) => f.category === "qso")}>
											{(f) => <span class="preview-chip qso">{f.label}</span>}
										</For>
										<Show
											when={
												fields().filter((f) => f.category === "qso").length ===
												0
											}
										>
											<span class="settings-sync-detail">No QSO fields</span>
										</Show>
									</div>
									<div class="preview-group">
										<span class="preview-group-label">Table Columns:</span>
										<For each={fields().filter((f) => f.show_in_table)}>
											{(f) => <span class="preview-chip table">{f.label}</span>}
										</For>
									</div>
								</div>
							</div>
						</Show>
					</div>

					<div class="modal-footer">
						<button class="btn btn-secondary" onClick={closeEditor}>
							Cancel
						</button>
						<button class="btn btn-primary" onClick={saveTemplate}>
							{editing() ? "Update" : "Create"} Template
						</button>
					</div>
				</Modal>
			</Show>
		</div>
	);
}
