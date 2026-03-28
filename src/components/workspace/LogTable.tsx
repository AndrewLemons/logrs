import { createSignal, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Pencil } from "lucide-solid";
import { addToast } from "../../stores/app";
import { formatDateTime } from "../../utils/time";
import Pagination from "../shared/Pagination";
import type { TemplateField, QsoPage, Qso } from "../../types";
import { BANDS, MODES, parseQsoData } from "../../types";

interface LogTableProps {
	logData: QsoPage | null | undefined;
	tableFields: TemplateField[];
	search: string;
	onSearchChange: (val: string) => void;
	filterBand: string;
	onBandChange: (val: string) => void;
	filterMode: string;
	onModeChange: (val: string) => void;
	sortBy: string;
	sortDir: string;
	onToggleSort: (col: string) => void;
	page: number;
	onPageChange: (page: number) => void;
	onDeleted: () => void;
	onExport: () => void;
	onEdit: (qso: Qso) => void;
}

export default function LogTable(props: LogTableProps) {
	const [selected, setSelected] = createSignal<Set<number>>(new Set());

	const totalPages = () =>
		Math.max(1, Math.ceil((props.logData?.total ?? 0) / 100));

	function sortIndicator(col: string) {
		if (props.sortBy !== col) return "";
		return props.sortDir === "ASC" ? " ↑" : " ↓";
	}

	function toggleSelect(id: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleSelectAll() {
		const qsos = props.logData?.qsos ?? [];
		if (selected().size === qsos.length) {
			setSelected(new Set<number>());
		} else {
			setSelected(new Set<number>(qsos.map((q) => q.id)));
		}
	}

	async function deleteSelected() {
		const ids = Array.from(selected());
		if (!ids.length) return;
		if (
			!(await confirm(`Delete ${ids.length} QSO(s)?`, {
				title: "Delete QSOs",
				kind: "warning",
			}))
		)
			return;
		try {
			await invoke("delete_qsos", { ids });
			addToast(`Deleted ${ids.length} QSO(s)`, "success");
			setSelected(new Set<number>());
			props.onDeleted();
		} catch (err) {
			addToast(`Error: ${err}`, "error");
		}
	}

	return (
		<>
			{/* Toolbar */}
			<Show when={selected().size > 0}>
				<div class="log-toolbar">
					<button class="btn btn-danger btn-sm" onClick={deleteSelected}>
						Delete ({selected().size})
					</button>
				</div>
			</Show>

			{/* Filters */}
			<div class="filter-bar">
				<input
					class="form-input"
					type="text"
					placeholder="Search..."
					value={props.search}
					onInput={(e) => props.onSearchChange(e.currentTarget.value)}
					style={{ width: "200px" }}
				/>
				<select
					class="form-select"
					value={props.filterBand}
					onChange={(e) => props.onBandChange(e.currentTarget.value)}
				>
					<option value="">All bands</option>
					<For each={BANDS}>{(b) => <option value={b}>{b}</option>}</For>
				</select>
				<select
					class="form-select"
					value={props.filterMode}
					onChange={(e) => props.onModeChange(e.currentTarget.value)}
				>
					<option value="">All modes</option>
					<For each={MODES}>{(m) => <option value={m}>{m}</option>}</For>
				</select>
			</div>

			<Show
				when={props.logData?.qsos.length}
				fallback={
					<div class="empty-state" style={{ padding: "24px" }}>
						<p>No QSOs yet. Start logging above.</p>
					</div>
				}
			>
				<div class="log-table-wrapper">
					<table class="data-table">
						<thead>
							<tr>
								<th style={{ width: "32px" }}>
									<input
										type="checkbox"
										class="checkbox"
										checked={
											selected().size === (props.logData?.qsos.length ?? 0) &&
											selected().size > 0
										}
										onChange={toggleSelectAll}
									/>
								</th>
								<th style={{ width: "32px" }} />
								<th onClick={() => props.onToggleSort("datetime")}>
									Date/Time{sortIndicator("datetime")}
								</th>
								<For each={props.tableFields}>
									{(field) => (
										<th onClick={() => props.onToggleSort(field.id)}>
											{field.label}
											{sortIndicator(field.id)}
										</th>
									)}
								</For>
							</tr>
						</thead>
						<tbody>
							<For each={props.logData?.qsos}>
								{(qso) => {
									const data = () => parseQsoData(qso);
									return (
										<tr>
											<td>
												<input
													type="checkbox"
													class="checkbox"
													checked={selected().has(qso.id)}
													onChange={() => toggleSelect(qso.id)}
												/>
											</td>
											<td>
												<button
													class="btn-icon"
													style={{ padding: "2px" }}
													onClick={() => props.onEdit(qso)}
													title="Edit QSO"
												>
													<Pencil size={13} />
												</button>
											</td>
											<td class="data-table-date">
												{formatDateTime(qso.datetime)}
											</td>
											<For each={props.tableFields}>
												{(field) => (
													<td
														class={
															field.id === "callsign"
																? "mono data-table-callsign"
																: field.id === "notes"
																	? "data-table-notes"
																	: ""
														}
													>
														{data()[field.id] ?? ""}
													</td>
												)}
											</For>
										</tr>
									);
								}}
							</For>
						</tbody>
					</table>
				</div>

				<Pagination
					page={props.page}
					totalPages={totalPages()}
					onPrev={() => props.onPageChange(props.page - 1)}
					onNext={() => props.onPageChange(props.page + 1)}
				/>
			</Show>
		</>
	);
}
