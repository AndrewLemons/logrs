import { createResource, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { activeProfile, setActiveProfile, activeLogbook, setActiveLogbook, activeTemplate, setActiveTemplate } from "../../stores/app";
import { setStationValues, initStationDefaults, getStationField, setStationField } from "../../stores/session";
import { StationField } from "../shared/FieldRenderers";
import type { TemplateField, Profile, Logbook, Template } from "../../types";

interface StationBarProps {
  stationFields: TemplateField[];
}

export default function StationBar(props: StationBarProps) {
  const [profiles] = createResource(() => invoke<Profile[]>("get_profiles"));
  const [logbooks] = createResource(() => invoke<Logbook[]>("get_logbooks"));

  async function onProfileChange(e: Event) {
    const id = parseInt((e.target as HTMLSelectElement).value);
    if (!id) return;
    await invoke("set_active_profile", { id });
    const profile = await invoke<Profile | null>("get_active_profile");
    if (profile) {
      setActiveProfile(profile);
      setStationValues({});
      initStationDefaults({
        band: profile.default_band,
        mode: profile.default_mode,
        power: profile.default_power,
        my_grid: profile.grid,
        my_park: profile.default_park,
        my_summit: profile.default_summit,
      });
    }
  }

  async function onLogbookChange(e: Event) {
    const id = parseInt((e.target as HTMLSelectElement).value);
    if (!id) return;
    await invoke("set_active_logbook", { id });
    const logbook = await invoke<Logbook | null>("get_active_logbook");
    if (logbook) {
      setActiveLogbook(logbook);
      const template = await invoke<Template>("get_template", { id: logbook.template_id });
      setActiveTemplate(template);
    }
  }

  return (
    <div class="station-bar">
      <div class="station-bar-context">
        <select class="station-bar-select" onChange={onProfileChange}>
          <option value="" selected={!activeProfile()}>Select profile...</option>
          <For each={profiles()}>
            {(p) => <option value={p.id} selected={p.id === activeProfile()?.id}>{p.callsign}</option>}
          </For>
        </select>
        <select class="station-bar-select" onChange={onLogbookChange}>
          <option value="" selected={!activeLogbook()}>Select logbook...</option>
          <For each={logbooks()}>
            {(lb) => <option value={lb.id} selected={lb.id === activeLogbook()?.id}>{lb.name}</option>}
          </For>
        </select>
        <Show when={activeTemplate()}>
          <span class="station-meta">{activeTemplate()!.name}</span>
        </Show>
      </div>
      <Show when={props.stationFields.length > 0}>
        <div class="station-bar-fields">
          <For each={props.stationFields}>
            {(field) => (
              <StationField
                field={field}
                value={getStationField(field.id)}
                onChange={(v) => setStationField(field.id, v)}
                onSelectGrid={
                  (field.id === "my_park" || field.id === "my_summit")
                    ? (grid) => setStationField("my_grid", grid)
                    : undefined
                }
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
