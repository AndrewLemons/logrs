import { createSignal, createResource, createEffect, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { activeLogbook, activeTemplate, activeProfile, addToast } from "../stores/app";
import StationBar from "../components/workspace/StationBar";
import QsoEntryForm from "../components/workspace/QsoEntryForm";
import LogTable from "../components/workspace/LogTable";
import QsoMap from "../components/workspace/QsoMap";
import CompetitionPanel from "../components/workspace/CompetitionPanel";
import EmptyState from "../components/shared/EmptyState";
import Modal from "../components/shared/Modal";
import ParkAutocomplete from "../components/shared/ParkAutocomplete";
import type { TemplateDef, QsoPage, QsoFilter, Qso } from "../types";
import { parseQsoData } from "../types";

export default function Workspace() {
  // --- Template parsing ---
  const templateDef = (): TemplateDef | null => {
    const t = activeTemplate();
    if (!t) return null;
    try {
      return JSON.parse(t.json_definition);
    } catch {
      return null;
    }
  };

  const stationFields = () => templateDef()?.fields.filter((f) => f.category === "station") ?? [];
  const qsoFields = () => templateDef()?.fields.filter((f) => f.category === "qso") ?? [];
  const tableFields = () => templateDef()?.fields.filter((f) => f.show_in_table) ?? [];

  // --- QSO form state (lifted so LogTable can show count) ---
  const [qsoValues, setQsoValues] = createSignal<Record<string, string>>({});

  // Initialize QSO defaults when template changes
  createEffect(() => {
    const tmpl = templateDef();
    if (!tmpl) return;
    const defaults: Record<string, string> = {};
    for (const f of tmpl.fields) {
      if (f.category === "qso" && f.default) {
        defaults[f.id] = f.default;
      }
    }
    setQsoValues(defaults);
  });

  // --- Edit QSO ---
  const [editingQso, setEditingQso] = createSignal<Qso | null>(null);
  const [editValues, setEditValues] = createSignal<Record<string, string>>({});

  function openEditModal(qso: Qso) {
    setEditValues(parseQsoData(qso));
    setEditingQso(qso);
  }

  function closeEditModal() {
    setEditingQso(null);
  }

  async function saveEdit() {
    const qso = editingQso();
    if (!qso) return;
    try {
      await invoke("update_qso", {
        qso: { ...qso, data_json: JSON.stringify(editValues()) },
      });
      addToast("QSO updated", "success");
      setEditingQso(null);
      setLogVersion((v) => v + 1);
    } catch (err) {
      addToast(`Error: ${err}`, "error");
    }
  }

  // --- Activity panel ---
  const [activeTab, setActiveTab] = createSignal<"log" | "map" | "competition">("log");
  const competitionConfig = () => templateDef()?.competition ?? null;

  // --- Log list state ---
  const [search, setSearch] = createSignal("");
  const [filterBand, setFilterBand] = createSignal("");
  const [filterMode, setFilterMode] = createSignal("");
  const [sortBy, setSortBy] = createSignal("datetime");
  const [sortDir, setSortDir] = createSignal("DESC");
  const [page, setPage] = createSignal(1);
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [logVersion, setLogVersion] = createSignal(0);

  let searchTimer: ReturnType<typeof setTimeout>;

  function onSearchInput(val: string) {
    setSearch(val);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 150);
  }

  function toggleSort(col: string) {
    if (sortBy() === col) {
      setSortDir(sortDir() === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(col);
      setSortDir("DESC");
    }
  }

  // --- Log list resource ---
  const filter = (): QsoFilter | null => {
    const lb = activeLogbook();
    if (!lb) return null;
    logVersion(); // trigger refetch
    return {
      logbook_id: lb.id,
      search: debouncedSearch() || undefined,
      band: filterBand() || undefined,
      mode: filterMode() || undefined,
      sort_by: sortBy(),
      sort_dir: sortDir(),
      page: page(),
      per_page: 100,
    };
  };

  const [logData] = createResource(filter, (f) =>
    f ? invoke<QsoPage>("get_qsos", { filter: f }) : Promise.resolve(null)
  );

  async function exportAdif() {
    const logbook = activeLogbook();
    if (!logbook) return;
    const path = await save({
      defaultPath: `logrs_export.adi`,
      filters: [{ name: "ADIF", extensions: ["adi", "adif"] }],
    });
    if (!path) return;
    try {
      const count = await invoke<number>("export_adif", { logbookId: logbook.id, path });
      addToast(`Exported ${count} QSOs`, "success");
    } catch (err) {
      addToast(`Export error: ${err}`, "error");
    }
  }

  return (
    <div class="workspace">
      <StationBar stationFields={stationFields()} />

      <Show when={!activeProfile() || !activeLogbook()}>
        <EmptyState
          title={!activeProfile() ? "No Profile Selected" : "No Logbook Selected"}
          description="Select a profile and logbook above to start logging."
        />
      </Show>

      <Show when={activeProfile() && activeLogbook()}>
        <QsoEntryForm
          qsoFields={qsoFields()}
          templateDef={templateDef()}
          qsoValues={qsoValues()}
          setQsoValues={setQsoValues}
          onSaved={() => setLogVersion((v) => v + 1)}
          totalQsos={logData()?.total ?? 0}
        />

        <div class="activity-panel">
          <div class="activity-tabs">
            <button
              class={`activity-tab ${activeTab() === "log" ? "active" : ""}`}
              onClick={() => setActiveTab("log")}
            >
              Log List
            </button>
            <button
              class={`activity-tab ${activeTab() === "map" ? "active" : ""}`}
              onClick={() => setActiveTab("map")}
            >
              Map View
            </button>
            <Show when={competitionConfig()?.enabled}>
              <button
                class={`activity-tab ${activeTab() === "competition" ? "active" : ""}`}
                onClick={() => setActiveTab("competition")}
              >
                Competition
              </button>
            </Show>
            <div class="toolbar-spacer" />
            <button class="btn btn-secondary btn-sm" onClick={exportAdif}>
              Export ADIF
            </button>
          </div>

          <Show when={activeTab() === "log"}>
            <LogTable
              logData={logData()}
              tableFields={tableFields()}
              search={search()}
              onSearchChange={onSearchInput}
              filterBand={filterBand()}
              onBandChange={(v) => { setFilterBand(v); setPage(1); }}
              filterMode={filterMode()}
              onModeChange={(v) => { setFilterMode(v); setPage(1); }}
              sortBy={sortBy()}
              sortDir={sortDir()}
              onToggleSort={toggleSort}
              page={page()}
              onPageChange={setPage}
              onDeleted={() => setLogVersion((v) => v + 1)}
              onExport={exportAdif}
              onEdit={openEditModal}
            />
          </Show>

          <QsoMap
            logData={logData()}
            visible={activeTab() === "map"}
          />

          <Show when={competitionConfig()?.enabled}>
            <CompetitionPanel
              competition={competitionConfig()!}
              logVersion={logVersion()}
              visible={activeTab() === "competition"}
            />
          </Show>
        </div>
      </Show>

      <Modal open={editingQso() !== null} title="Edit QSO" onClose={closeEditModal}>
        <div class="modal-body" style={{ "max-height": "60vh", "overflow-y": "auto" }}>
          <For each={templateDef()?.fields ?? []}>
            {(field) => {
              const value = () => editValues()[field.id] ?? "";
              const setValue = (v: string) => setEditValues((p) => ({ ...p, [field.id]: v }));
              return (
                <div class="form-group">
                  <label class="form-label">{field.label}</label>
                  {field.type === "dropdown" && field.options ? (
                    <select class="form-select" value={value()} onChange={(e) => setValue(e.currentTarget.value)}>
                      <option value="">—</option>
                      <For each={field.options}>{(opt) => <option value={opt}>{opt}</option>}</For>
                    </select>
                  ) : field.type === "lookup" && field.lookup ? (
                    <ParkAutocomplete
                      value={value()}
                      onChange={setValue}
                      lookup={field.lookup}
                      class="form-input"
                      onSelectGrid={(grid) => {
                        const gridField = (field.id === "my_park" || field.id === "my_summit") ? "my_grid" : "their_grid";
                        setEditValues((p) => ({ ...p, [gridField]: grid }));
                      }}
                    />
                  ) : (
                    <input
                      class={`form-input${field.id === "callsign" ? " callsign" : ""}`}
                      type="text"
                      value={value()}
                      onInput={(e) => setValue(e.currentTarget.value)}
                    />
                  )}
                </div>
              );
            }}
          </For>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
          <button class="btn btn-primary" onClick={saveEdit}>Save Changes</button>
        </div>
      </Modal>
    </div>
  );
}
