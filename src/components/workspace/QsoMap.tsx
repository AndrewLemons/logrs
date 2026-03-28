import { createEffect, onMount, onCleanup } from "solid-js";
import { activeProfile, theme } from "../../stores/app";
import { getStationField } from "../../stores/session";
import { gridToLatLng } from "../../utils/maidenhead";
import { parseQsoData } from "../../types";
import type { QsoPage } from "../../types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface QsoMapProps {
  logData: QsoPage | null | undefined;
  visible: boolean;
}

export default function QsoMap(props: QsoMapProps) {
  let mapContainer!: HTMLDivElement;
  let map: L.Map | undefined;
  let tileLayer: L.TileLayer | undefined;
  const markersLayer = L.layerGroup();

  const tileUrl = () =>
    theme() === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const tileAttribution = () =>
    theme() === "dark"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  function initMap() {
    if (map || !mapContainer) return;
    map = L.map(mapContainer, { preferCanvas: true }).setView([39.8283, -98.5795], 4);
    tileLayer = L.tileLayer(tileUrl(), {
      attribution: tileAttribution(),
      maxZoom: 18,
      crossOrigin: true,
    }).addTo(map);
    markersLayer.addTo(map);
  }

  // Swap tile layer when theme changes
  createEffect(() => {
    const url = tileUrl();
    if (!map || !tileLayer) return;
    tileLayer.setUrl(url);
  });

  // Invalidate + replot whenever becoming visible
  createEffect(() => {
    if (props.visible) {
      requestAnimationFrame(() => {
        map?.invalidateSize();
        plotQsos();
      });
    }
  });

  // Replot when log data changes and map is visible
  createEffect(() => {
    if (props.visible) {
      props.logData; // track dependency
      requestAnimationFrame(() => plotQsos());
    }
  });

  function plotQsos() {
    if (!map) return;
    markersLayer.clearLayers();
    const profile = activeProfile();
    const myGrid = getStationField("my_grid") || profile?.grid;
    let myPos: [number, number] | null = null;

    if (myGrid) {
      myPos = gridToLatLng(myGrid);
      if (myPos) {
        L.circleMarker(myPos, { radius: 8, color: "#e74c3c", fillColor: "#e74c3c", fillOpacity: 0.9 })
          .bindPopup(`<b>${profile?.callsign ?? "Me"}</b><br/>${myGrid}`)
          .addTo(markersLayer);
      }
    }

    const qsos = props.logData?.qsos;
    if (!qsos) return;

    for (const q of qsos) {
      const data = parseQsoData(q);
      const theirGrid = data.their_grid;
      if (!theirGrid) continue;
      const pos = gridToLatLng(theirGrid);
      if (!pos) continue;

      L.circleMarker(pos, {
        radius: 5, color: "#3498db", fillColor: "#3498db", fillOpacity: 0.7,
      }).bindPopup(
        `<b>${data.callsign ?? ""}</b><br/>${data.band ?? ""} ${data.mode ?? ""}<br/>${q.datetime}<br/>Grid: ${theirGrid}`
      ).addTo(markersLayer);

      if (myPos) {
        L.polyline([myPos, pos], { color: "#3498db", weight: 1.5, opacity: 0.55 })
          .addTo(markersLayer);
      }
    }
  }

  onMount(() => initMap());
  onCleanup(() => {
    map?.remove();
    map = undefined;
  });

  return (
    <div
      ref={mapContainer}
      class="workspace-map"
      style={{ display: props.visible ? "block" : "none" }}
    />
  );
}
