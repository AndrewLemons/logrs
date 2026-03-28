import { createSignal, Show, For, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { latLngToGrid } from "../../utils/maidenhead";
import type { PotaPark, SotaSummit } from "../../types";

interface ParkAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  lookup: "pota" | "sota";
  placeholder?: string;
  class?: string;
  onSelectGrid?: (grid: string) => void;
}

interface Suggestion {
  code: string;
  name: string;
  grid?: string;
}

export default function ParkAutocomplete(props: ParkAutocompleteProps) {
  const [suggestions, setSuggestions] = createSignal<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  let debounceTimer: ReturnType<typeof setTimeout>;
  let wrapperRef: HTMLDivElement | undefined;

  onCleanup(() => clearTimeout(debounceTimer));

  function handleClickOutside(e: MouseEvent) {
    if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
      setShowDropdown(false);
    }
  }

  // Attach/detach global listener when dropdown opens/closes
  function openDropdown() {
    setShowDropdown(true);
    document.addEventListener("mousedown", handleClickOutside);
  }

  function closeDropdown() {
    setShowDropdown(false);
    document.removeEventListener("mousedown", handleClickOutside);
  }

  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  async function fetchSuggestions(query: string) {
    if (query.length < 2) {
      setSuggestions([]);
      closeDropdown();
      return;
    }

    try {
      if (props.lookup === "pota") {
        const parks = await invoke<PotaPark[]>("get_pota_parks", { query });
        setSuggestions(parks.map((p) => ({ code: p.reference, name: p.name, grid: p.grid || undefined })));
      } else {
        const summits = await invoke<SotaSummit[]>("get_sota_summits", { query });
        setSuggestions(summits.map((s) => ({
          code: s.summit_code,
          name: s.summit_name,
          grid: latLngToGrid(s.latitude, s.longitude),
        })));
      }
      if (suggestions().length > 0) {
        openDropdown();
      } else {
        closeDropdown();
      }
    } catch {
      setSuggestions([]);
      closeDropdown();
    }
  }

  function onInput(value: string) {
    props.onChange(value);
    setActiveIndex(-1);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(value), 150);
  }

  function selectSuggestion(suggestion: Suggestion) {
    props.onChange(suggestion.code);
    if (suggestion.grid && props.onSelectGrid) {
      props.onSelectGrid(suggestion.grid);
    }
    closeDropdown();
    setSuggestions([]);
  }

  function onKeyDown(e: KeyboardEvent) {
    const items = suggestions();
    if (!showDropdown() || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex() >= 0) {
      e.preventDefault();
      selectSuggestion(items[activeIndex()]);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  return (
    <div class="autocomplete-wrapper" ref={wrapperRef}>
      <input
        class={props.class ?? "form-input"}
        type="text"
        value={props.value}
        onInput={(e) => onInput(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (suggestions().length > 0) openDropdown();
        }}
        placeholder={props.placeholder ?? ""}
        autocomplete="off"
        spellcheck={false}
      />
      <Show when={showDropdown() && suggestions().length > 0}>
        <ul class="autocomplete-dropdown">
          <For each={suggestions()}>
            {(item, index) => (
              <li
                class={`autocomplete-item ${index() === activeIndex() ? "active" : ""}`}
                onMouseDown={() => selectSuggestion(item)}
                onMouseEnter={() => setActiveIndex(index())}
              >
                <span class="autocomplete-code">{item.code}</span>
                <span class="autocomplete-name">{item.name}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
