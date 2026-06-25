/// Raw reading from a radio, before band lookup or mode normalization.
#[derive(Debug, Clone, Default)]
pub struct RawReading {
	pub frequency_hz: Option<u64>,
	/// Mode token as reported by the provider (e.g. hamlib's "USB", "PKTUSB").
	/// Intentionally not normalized here — normalization is provider-specific
	/// (different backends use different tokens for the same mode).
	pub mode_raw: Option<String>,
}

/// A source of live radio state. Implementations own their own connection
/// and are polled periodically by the radio manager; they are not expected
/// to do their own background polling or retry scheduling.
#[async_trait::async_trait]
pub trait RadioProvider: Send {
	async fn connect(&mut self) -> Result<(), String>;
	fn disconnect(&mut self);
	async fn poll(&mut self) -> Result<RawReading, String>;
}
