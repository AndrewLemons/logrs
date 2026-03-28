/** Convert UTC datetime string to local display string */
export function utcToLocal(utc: string): string {
	if (!utc) return "";
	const d = new Date(utc + "Z");
	return d.toLocaleString();
}

/** Format UTC datetime for display in log table */
export function formatDateTime(utc: string): string {
	if (!utc) return "";
	const d = new Date(utc + "Z");
	return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

/** Get current UTC datetime string */
export function nowUtc(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}
