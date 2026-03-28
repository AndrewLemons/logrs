// TypeScript types matching Rust models

export interface Profile {
  id: number;
  callsign: string;
  name: string;
  grid: string;
  default_power: string;
  default_band: string;
  default_mode: string;
  default_park: string;
  default_summit: string;
  station_description: string;
  created_at: string;
}

export interface CreateProfile {
  callsign: string;
  name: string;
  grid: string;
  default_power: string;
  default_band: string;
  default_mode: string;
  default_park: string;
  default_summit: string;
  station_description: string;
}

export interface Logbook {
  id: number;
  name: string;
  profile_id: number;
  template_id: number;
  created_at: string;
  metadata_json: string;
}

export interface CreateLogbook {
  name: string;
  profile_id: number;
  template_id: number;
  metadata_json: string;
}

export interface Qso {
  id: number;
  logbook_id: number;
  datetime: string;
  data_json: string;
}

export interface CreateQso {
  logbook_id: number;
  data_json: string;
}

export interface Template {
  id: number;
  name: string;
  json_definition: string;
  is_builtin: boolean;
}

export interface CreateTemplate {
  name: string;
  json_definition: string;
}

export interface QsoFilter {
  logbook_id: number;
  search?: string;
  band?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  per_page?: number;
}

export interface QsoPage {
  qsos: Qso[];
  total: number;
  page: number;
  per_page: number;
}

export interface CallsignInfo {
  callsign: string;
  name: string;
  grid: string;
  city: string;
  state: string;
  country: string;
}

export interface PotaPark {
  reference: string;
  name: string;
  latitude: number;
  longitude: number;
  grid: string;
  location_desc: string;
}

export interface SotaSummit {
  summit_code: string;
  association_name: string;
  region_name: string;
  summit_name: string;
  alt_m: number;
  alt_ft: number;
  longitude: number;
  latitude: number;
  points: number;
  bonus_points: number;
  valid_from: string;
  valid_to: string;
}

export interface SyncStatus {
  pota_last_synced: string | null;
  pota_count: number;
  sota_last_synced: string | null;
  sota_count: number;
}

export interface PotaSpotResult {
  reference: string;
  park_name: string;
  frequency: string;
  mode: string;
  spot_time: string;
  grid: string;
}

export interface SyncProgress {
  sync_type: string;
  current: number;
  total: number;
  label: string;
}

// Template definition types (JSON-driven field system)
export type FieldType = "text" | "numeric" | "dropdown" | "lookup" | "derived";
export type FieldCategory = "station" | "qso";

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
  required: boolean;
  persistent: boolean;
  show_in_table: boolean;
  default?: string;
  options?: string[];
  lookup?: "pota" | "sota";
}

export interface TemplateDef {
  fields: TemplateField[];
}

export const BANDS = [
  "160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m", "2m", "70cm",
];

export const MODES = [
  "SSB", "CW", "FT8", "FT4", "FM", "AM", "RTTY", "PSK31", "JS8", "DSTAR", "DMR", "C4FM",
];

// Master list of all available fields for template editor
export const AVAILABLE_FIELDS: Array<{
  id: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
  group: string;
  default?: string;
  options?: string[];
  lookup?: "pota" | "sota";
}> = [
  // Core
  { id: "callsign", label: "Callsign", type: "text", category: "qso", group: "Core" },
  { id: "rst_sent", label: "RST Sent", type: "text", category: "qso", group: "Core", default: "59" },
  { id: "rst_recv", label: "RST Recv", type: "text", category: "qso", group: "Core", default: "59" },
  // Station
  { id: "band", label: "Band", type: "dropdown", category: "station", group: "Station", options: BANDS },
  { id: "mode", label: "Mode", type: "dropdown", category: "station", group: "Station", options: MODES },
  { id: "frequency", label: "Frequency", type: "text", category: "station", group: "Station" },
  { id: "power", label: "Power (W)", type: "text", category: "station", group: "Station" },
  { id: "my_grid", label: "My Grid", type: "text", category: "station", group: "Station" },
  // Location
  { id: "my_park", label: "My Park", type: "lookup", category: "station", group: "Location", lookup: "pota" },
  { id: "their_park", label: "Their Park", type: "lookup", category: "qso", group: "Location", lookup: "pota" },
  { id: "my_summit", label: "My Summit", type: "lookup", category: "station", group: "Location", lookup: "sota" },
  { id: "their_summit", label: "Their Summit", type: "lookup", category: "qso", group: "Location", lookup: "sota" },
  // Contact
  { id: "name", label: "Name", type: "text", category: "qso", group: "Contact" },
  { id: "their_grid", label: "Their Grid", type: "text", category: "qso", group: "Contact" },
  { id: "notes", label: "Notes", type: "text", category: "qso", group: "Optional" },
];

/** Parse a QSO's data_json into a Record */
export function parseQsoData(qso: Qso): Record<string, string> {
  try {
    return JSON.parse(qso.data_json);
  } catch {
    return {};
  }
}
