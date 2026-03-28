/** Convert lat/lng to a 6-character Maidenhead grid square */
export function latLngToGrid(lat: number, lng: number): string {
	const adjLon = lng + 180;
	const adjLat = lat + 90;
	const f1 = String.fromCharCode(65 + Math.floor(adjLon / 20));
	const f2 = String.fromCharCode(65 + Math.floor(adjLat / 10));
	const s1 = String(Math.floor((adjLon % 20) / 2));
	const s2 = String(Math.floor(adjLat % 10));
	const ss1 = String.fromCharCode(97 + Math.floor((adjLon % 2) * 12));
	const ss2 = String.fromCharCode(97 + Math.floor((adjLat % 1) * 24));
	return f1 + f2 + s1 + s2 + ss1 + ss2;
}

/** Convert Maidenhead grid square to [lat, lng] */
export function gridToLatLng(grid: string): [number, number] | null {
	if (!grid || grid.length < 4) return null;
	const g = grid.toUpperCase();

	const lon = (g.charCodeAt(0) - 65) * 20 - 180;
	const lat = (g.charCodeAt(1) - 65) * 10 - 90;
	const lon2 = parseInt(g[2]) * 2;
	const lat2 = parseInt(g[3]) * 1;

	let finalLat = lat + lat2 + 0.5;
	let finalLon = lon + lon2 + 1;

	if (g.length >= 6) {
		const lon3 = (g.charCodeAt(4) - 65) * (2 / 24);
		const lat3 = (g.charCodeAt(5) - 65) * (1 / 24);
		finalLat = lat + lat2 + lat3 + 1 / 48;
		finalLon = lon + lon2 + lon3 + 1 / 24;
	}

	return [finalLat, finalLon];
}
