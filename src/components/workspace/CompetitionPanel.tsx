import { createSignal, createResource, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { activeLogbook } from "../../stores/app";
import { BANDS, MODES } from "../../types";
import type { CompetitionConfig } from "../../types";
import { computeScores } from "../../utils/competition";
import type { CompetitionScores, MultiplierStatus } from "../../utils/competition";

interface Props {
  competition: CompetitionConfig;
  logVersion: number;
  visible: boolean;
}

export default function CompetitionPanel(props: Props) {
  const [filterBand, setFilterBand] = createSignal("");
  const [filterMode, setFilterMode] = createSignal("");
  const [hoveredMult, setHoveredMult] = createSignal<MultiplierStatus | null>(null);
  const [tooltipPos, setTooltipPos] = createSignal({ x: 0, y: 0 });

  // Fetch all QSO data for this logbook
  const fetchKey = () => {
    const lb = activeLogbook();
    if (!lb || !props.visible) return null;
    // Include logVersion to trigger refetch on new QSOs
    return { logbook_id: lb.id, version: props.logVersion };
  };

  const [allQsoData] = createResource(fetchKey, async (key) => {
    if (!key) return [];
    const rawList = await invoke<string[]>("get_all_qso_data", { logbookId: key.logbook_id });
    return rawList.map((json) => {
      try { return JSON.parse(json) as Record<string, string>; }
      catch { return {} as Record<string, string>; }
    });
  });

  // Compute scores reactively
  const scores = (): CompetitionScores | null => {
    const data = allQsoData();
    if (!data) return null;
    return computeScores(data, props.competition, filterBand() || undefined, filterMode() || undefined);
  };

  function handleCellHover(mult: MultiplierStatus, e: MouseEvent) {
    if (mult.worked) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
      setHoveredMult(mult);
    }
  }

  function handleCellLeave() {
    setHoveredMult(null);
  }

  return (
    <div class="competition-panel" style={{ display: props.visible ? "flex" : "none" }}>
      {/* Score Summary Bar */}
      <div class="competition-summary">
        <div class="competition-stat primary">
          <span class="competition-stat-value">{scores()?.total_points ?? 0}</span>
          <span class="competition-stat-label">Total Points</span>
        </div>
        <div class="competition-stat">
          <span class="competition-stat-value">{scores()?.total_qsos ?? 0}</span>
          <span class="competition-stat-label">QSOs</span>
        </div>
        <div class="competition-stat">
          <span class="competition-stat-value">
            {scores()?.total_multipliers_worked ?? 0}/{scores()?.total_multipliers_possible ?? 0}
          </span>
          <span class="competition-stat-label">{props.competition.multipliers.label}</span>
        </div>
        <div class="competition-stat">
          <span class="competition-stat-value">{scores()?.completion_pct ?? 0}%</span>
          <span class="competition-stat-label">Complete</span>
        </div>
        <Show when={scores()?.multiplier_points}>
          <div class="competition-stat">
            <span class="competition-stat-value">{scores()!.multiplier_points}</span>
            <span class="competition-stat-label">Bonus Points</span>
          </div>
        </Show>

        <div class="competition-filters">
          <select
            class="form-select competition-filter-select"
            value={filterBand()}
            onChange={(e) => setFilterBand(e.currentTarget.value)}
          >
            <option value="">All Bands</option>
            <For each={BANDS}>{(b) => <option value={b}>{b}</option>}</For>
          </select>
          <select
            class="form-select competition-filter-select"
            value={filterMode()}
            onChange={(e) => setFilterMode(e.currentTarget.value)}
          >
            <option value="">All Modes</option>
            <For each={MODES}>{(m) => <option value={m}>{m}</option>}</For>
          </select>
        </div>
      </div>

      {/* Progress bar */}
      <div class="competition-progress-bar">
        <div
          class="competition-progress-fill"
          style={{ width: `${scores()?.completion_pct ?? 0}%` }}
        />
      </div>

      {/* Multiplier Grid */}
      <div class="competition-grid-wrapper">
        <div class="competition-grid-title">{props.competition.multipliers.label} Progress</div>
        <div
          class="competition-grid"
          style={{ "grid-template-columns": `repeat(${props.competition.multipliers.grid_columns}, 1fr)` }}
        >
          <For each={scores()?.multipliers ?? []}>
            {(mult) => (
              <div
                class={`competition-cell ${mult.worked ? "worked" : "not-worked"}`}
                onMouseEnter={(e) => handleCellHover(mult, e)}
                onMouseLeave={handleCellLeave}
                title={mult.label}
              >
                <span class="competition-cell-id">{mult.id}</span>
                <Show when={mult.worked}>
                  <span class="competition-cell-count">{mult.contacts.length}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Band breakdown */}
      <Show when={scores()?.band_breakdown && Object.keys(scores()!.band_breakdown!).length > 0}>
        <div class="competition-band-breakdown">
          <div class="competition-grid-title">Band Breakdown</div>
          <div class="competition-band-chips">
            <For each={Object.entries(scores()!.band_breakdown!).sort((a, b) => b[1] - a[1])}>
              {([band, count]) => (
                <span class="competition-band-chip">
                  <strong>{band}</strong> {count}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Tooltip */}
      <Show when={hoveredMult()}>
        <div
          class="competition-tooltip"
          style={{
            left: `${tooltipPos().x + 12}px`,
            top: `${tooltipPos().y - 8}px`,
          }}
        >
          <div class="competition-tooltip-title">{hoveredMult()!.label}</div>
          <div class="competition-tooltip-count">
            {hoveredMult()!.contacts.length} contact{hoveredMult()!.contacts.length !== 1 ? "s" : ""}
          </div>
          <For each={hoveredMult()!.contacts.slice(0, 5)}>
            {(c) => (
              <div class="competition-tooltip-row">
                <span class="competition-tooltip-call">{c.callsign}</span>
                <span>{c.band}</span>
                <span>{c.mode}</span>
              </div>
            )}
          </For>
          <Show when={hoveredMult()!.contacts.length > 5}>
            <div class="competition-tooltip-more">
              +{hoveredMult()!.contacts.length - 5} more
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
