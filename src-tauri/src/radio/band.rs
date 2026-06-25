// Amateur band edges (Hz), matching the BANDS list in src/types/index.ts.
// IARU Region 1/2/3 allocations vary slightly at the margins; these ranges
// are wide enough to cover the common case without needing per-region config.
const BAND_RANGES: &[(&str, u64, u64)] = &[
	("160m", 1_800_000, 2_000_000),
	("80m", 3_500_000, 4_000_000),
	("60m", 5_250_000, 5_450_000),
	("40m", 7_000_000, 7_300_000),
	("30m", 10_100_000, 10_150_000),
	("20m", 14_000_000, 14_350_000),
	("17m", 18_068_000, 18_168_000),
	("15m", 21_000_000, 21_450_000),
	("12m", 24_890_000, 24_990_000),
	("10m", 28_000_000, 29_700_000),
	("6m", 50_000_000, 54_000_000),
	("2m", 144_000_000, 148_000_000),
	("70cm", 420_000_000, 450_000_000),
];

pub fn band_for_frequency(hz: u64) -> Option<String> {
	BAND_RANGES
		.iter()
		.find(|(_, min, max)| hz >= *min && hz <= *max)
		.map(|(name, _, _)| name.to_string())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn finds_known_bands() {
		assert_eq!(band_for_frequency(14_074_000), Some("20m".to_string()));
		assert_eq!(band_for_frequency(7_040_000), Some("40m".to_string()));
		assert_eq!(band_for_frequency(146_520_000), Some("2m".to_string()));
	}

	#[test]
	fn returns_none_outside_bands() {
		assert_eq!(band_for_frequency(1_000_000), None);
		assert_eq!(band_for_frequency(13_000_000), None);
	}
}
