import type { CompetitionConfig, MultiplierValue, ScoringConfig } from "../types";

// ── Multiplier presets ─────────────────────────────────────────────

export const US_STATES: MultiplierValue[] = [
  { id: "AL", label: "Alabama" }, { id: "AK", label: "Alaska" },
  { id: "AZ", label: "Arizona" }, { id: "AR", label: "Arkansas" },
  { id: "CA", label: "California" }, { id: "CO", label: "Colorado" },
  { id: "CT", label: "Connecticut" }, { id: "DE", label: "Delaware" },
  { id: "FL", label: "Florida" }, { id: "GA", label: "Georgia" },
  { id: "HI", label: "Hawaii" }, { id: "ID", label: "Idaho" },
  { id: "IL", label: "Illinois" }, { id: "IN", label: "Indiana" },
  { id: "IA", label: "Iowa" }, { id: "KS", label: "Kansas" },
  { id: "KY", label: "Kentucky" }, { id: "LA", label: "Louisiana" },
  { id: "ME", label: "Maine" }, { id: "MD", label: "Maryland" },
  { id: "MA", label: "Massachusetts" }, { id: "MI", label: "Michigan" },
  { id: "MN", label: "Minnesota" }, { id: "MS", label: "Mississippi" },
  { id: "MO", label: "Missouri" }, { id: "MT", label: "Montana" },
  { id: "NE", label: "Nebraska" }, { id: "NV", label: "Nevada" },
  { id: "NH", label: "New Hampshire" }, { id: "NJ", label: "New Jersey" },
  { id: "NM", label: "New Mexico" }, { id: "NY", label: "New York" },
  { id: "NC", label: "North Carolina" }, { id: "ND", label: "North Dakota" },
  { id: "OH", label: "Ohio" }, { id: "OK", label: "Oklahoma" },
  { id: "OR", label: "Oregon" }, { id: "PA", label: "Pennsylvania" },
  { id: "RI", label: "Rhode Island" }, { id: "SC", label: "South Carolina" },
  { id: "SD", label: "South Dakota" }, { id: "TN", label: "Tennessee" },
  { id: "TX", label: "Texas" }, { id: "UT", label: "Utah" },
  { id: "VT", label: "Vermont" }, { id: "VA", label: "Virginia" },
  { id: "WA", label: "Washington" }, { id: "WV", label: "West Virginia" },
  { id: "WI", label: "Wisconsin" }, { id: "WY", label: "Wyoming" },
  { id: "DC", label: "District of Columbia" },
];

export const CQ_ZONES: MultiplierValue[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i + 1),
  label: `Zone ${i + 1}`,
}));

export const ITU_ZONES: MultiplierValue[] = Array.from({ length: 90 }, (_, i) => ({
  id: String(i + 1),
  label: `Zone ${i + 1}`,
}));

export const CONTINENTS: MultiplierValue[] = [
  { id: "NA", label: "North America" }, { id: "SA", label: "South America" },
  { id: "EU", label: "Europe" }, { id: "AF", label: "Africa" },
  { id: "AS", label: "Asia" }, { id: "OC", label: "Oceania" },
  { id: "AN", label: "Antarctica" },
];

// ── Competition presets ────────────────────────────────────────────

export interface CompetitionPreset {
  id: string;
  name: string;
  config: CompetitionConfig;
  /** Field IDs that should be auto-added to the template */
  required_fields: string[];
}

export const COMPETITION_PRESETS: CompetitionPreset[] = [
  {
    id: "was",
    name: "Worked All States",
    required_fields: ["state"],
    config: {
      enabled: true,
      name: "Worked All States",
      scoring: { points_per_qso: 1, bonus_per_new_multiplier: 0, use_band_multipliers: false, use_mode_multipliers: false },
      multipliers: { field: "state", label: "US States", values: US_STATES, grid_columns: 10 },
    },
  },
  {
    id: "was_band",
    name: "Worked All States (per band)",
    required_fields: ["state"],
    config: {
      enabled: true,
      name: "Worked All States (per band)",
      scoring: { points_per_qso: 1, bonus_per_new_multiplier: 0, use_band_multipliers: true, use_mode_multipliers: false },
      multipliers: { field: "state", label: "US States", values: US_STATES, grid_columns: 10 },
    },
  },
  {
    id: "cq_zones",
    name: "CQ Zones",
    required_fields: ["cq_zone"],
    config: {
      enabled: true,
      name: "CQ Zones",
      scoring: { points_per_qso: 1, bonus_per_new_multiplier: 0, use_band_multipliers: false, use_mode_multipliers: false },
      multipliers: { field: "cq_zone", label: "CQ Zones", values: CQ_ZONES, grid_columns: 10 },
    },
  },
  {
    id: "itu_zones",
    name: "ITU Zones",
    required_fields: ["itu_zone"],
    config: {
      enabled: true,
      name: "ITU Zones",
      scoring: { points_per_qso: 1, bonus_per_new_multiplier: 0, use_band_multipliers: false, use_mode_multipliers: false },
      multipliers: { field: "itu_zone", label: "ITU Zones", values: ITU_ZONES, grid_columns: 10 },
    },
  },
  {
    id: "continents",
    name: "Worked All Continents",
    required_fields: ["country"],
    config: {
      enabled: true,
      name: "Worked All Continents",
      scoring: { points_per_qso: 1, bonus_per_new_multiplier: 5, use_band_multipliers: false, use_mode_multipliers: false },
      multipliers: { field: "country", label: "Continents", values: CONTINENTS, grid_columns: 4 },
    },
  },
];

// ── Scoring engine ─────────────────────────────────────────────────

export interface MultiplierStatus {
  id: string;
  label: string;
  group?: string;
  worked: boolean;
  /** Band+mode combos where this multiplier was worked */
  contacts: { callsign: string; band: string; mode: string; datetime?: string }[];
  /** Per-band tracking (when use_band_multipliers is true) */
  bands_worked?: Set<string>;
}

export interface CompetitionScores {
  total_qsos: number;
  total_points: number;
  total_multipliers_worked: number;
  total_multipliers_possible: number;
  multiplier_points: number;
  raw_points: number;
  completion_pct: number;
  multipliers: MultiplierStatus[];
  /** When band multipliers enabled, breakdown per band */
  band_breakdown?: Record<string, number>;
}

/**
 * Compute competition scores from raw QSO data.
 * All computation is pure — no side effects or async calls.
 */
export function computeScores(
  qsoDataList: Record<string, string>[],
  config: CompetitionConfig,
  filterBand?: string,
  filterMode?: string,
): CompetitionScores {
  const { scoring, multipliers } = config;

  // Build multiplier status map
  const statusMap = new Map<string, MultiplierStatus>();
  for (const mv of multipliers.values) {
    statusMap.set(mv.id.toUpperCase(), {
      id: mv.id,
      label: mv.label,
      group: mv.group,
      worked: false,
      contacts: [],
      bands_worked: scoring.use_band_multipliers ? new Set() : undefined,
    });
  }

  let total_qsos = 0;
  const bandBreakdown: Record<string, number> = {};

  for (const data of qsoDataList) {
    const band = data.band ?? "";
    const mode = data.mode ?? "";

    // Apply filters
    if (filterBand && band !== filterBand) continue;
    if (filterMode && mode !== filterMode) continue;

    total_qsos++;

    const multValue = (data[multipliers.field] ?? "").toUpperCase().trim();
    if (!multValue) continue;

    const status = statusMap.get(multValue);
    if (!status) continue;

    status.worked = true;
    status.contacts.push({
      callsign: data.callsign ?? "",
      band,
      mode,
      datetime: data.datetime,
    });

    if (scoring.use_band_multipliers && band) {
      status.bands_worked!.add(band);
      bandBreakdown[band] = (bandBreakdown[band] ?? 0) + 1;
    }
  }

  // Calculate multiplier count
  let totalMultipliersWorked = 0;
  const totalMultipliersPossible = multipliers.values.length;

  if (scoring.use_band_multipliers) {
    // Each unique (multiplier, band) pair counts
    for (const status of statusMap.values()) {
      if (status.bands_worked) {
        totalMultipliersWorked += status.bands_worked.size;
      }
    }
  } else {
    for (const status of statusMap.values()) {
      if (status.worked) totalMultipliersWorked++;
    }
  }

  const rawPoints = total_qsos * scoring.points_per_qso;
  const multiplierPoints = totalMultipliersWorked * scoring.bonus_per_new_multiplier;
  const totalPoints = rawPoints + multiplierPoints;
  const completionPct = totalMultipliersPossible > 0
    ? Math.round((statusMap.size > 0 ? [...statusMap.values()].filter(s => s.worked).length : 0) / totalMultipliersPossible * 100)
    : 0;

  return {
    total_qsos,
    total_points: totalPoints,
    total_multipliers_worked: totalMultipliersWorked,
    total_multipliers_possible: totalMultipliersPossible,
    multiplier_points: multiplierPoints,
    raw_points: rawPoints,
    completion_pct: completionPct,
    multipliers: [...statusMap.values()],
    band_breakdown: scoring.use_band_multipliers ? bandBreakdown : undefined,
  };
}

/**
 * Default scoring config for new competition templates
 */
export function defaultScoringConfig(): ScoringConfig {
  return {
    points_per_qso: 1,
    bonus_per_new_multiplier: 0,
    use_band_multipliers: false,
    use_mode_multipliers: false,
  };
}
