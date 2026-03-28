/** Validate amateur radio callsign format (basic) */
export function isValidCallsign(callsign: string): boolean {
  if (!callsign || callsign.length < 3) return false;
  // Basic pattern: optional prefix, 1-2 digits, 1-4 letters, optional suffix
  return /^[A-Z0-9]{1,4}[0-9][A-Z]{1,4}(\/[A-Z0-9]+)?$/i.test(callsign.trim());
}

/** Validate Maidenhead grid square (4 or 6 char) */
export function isValidGrid(grid: string): boolean {
  if (!grid) return true; // empty is ok
  return /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(grid.trim());
}
