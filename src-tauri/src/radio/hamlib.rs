use super::provider::{RadioProvider, RawReading};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

/// Client for Hamlib's `rigctld` network protocol (plain, non-extended mode).
/// On success a command returns its value(s) one per line; on failure it
/// returns a line starting with "RPRT" followed by a non-zero error code.
pub struct HamlibProvider {
	host: String,
	port: u16,
	stream: Option<BufReader<TcpStream>>,
}

impl HamlibProvider {
	pub fn new(host: String, port: u16) -> Self {
		Self {
			host,
			port,
			stream: None,
		}
	}

	async fn write_cmd(&mut self, cmd: &str) -> Result<(), String> {
		let stream = self.stream.as_mut().ok_or("not connected")?;
		if let Err(e) = stream.write_all(format!("{cmd}\n").as_bytes()).await {
			self.stream = None;
			return Err(e.to_string());
		}
		if let Err(e) = stream.flush().await {
			self.stream = None;
			return Err(e.to_string());
		}
		Ok(())
	}

	async fn read_line(&mut self) -> Result<String, String> {
		let stream = self.stream.as_mut().ok_or("not connected")?;
		let mut line = String::new();
		let n = match stream.read_line(&mut line).await {
			Ok(n) => n,
			Err(e) => {
				self.stream = None;
				return Err(e.to_string());
			}
		};
		if n == 0 {
			self.stream = None;
			return Err("rigctld closed the connection".to_string());
		}
		let line = line.trim().to_string();
		if line.starts_with("RPRT") {
			return Err(format!("rigctld error: {line}"));
		}
		Ok(line)
	}

	async fn get_frequency(&mut self) -> Result<u64, String> {
		self.write_cmd("f").await?;
		let line = self.read_line().await?;
		line.parse::<u64>()
			.map_err(|_| format!("unexpected frequency response: {line}"))
	}

	async fn get_mode(&mut self) -> Result<String, String> {
		self.write_cmd("m").await?;
		let mode = self.read_line().await?;
		// Second line is passband width in Hz; not needed for logging.
		let _passband = self.read_line().await?;
		Ok(mode)
	}
}

#[async_trait::async_trait]
impl RadioProvider for HamlibProvider {
	async fn connect(&mut self) -> Result<(), String> {
		let stream = TcpStream::connect((self.host.as_str(), self.port))
			.await
			.map_err(|e| format!("failed to connect to rigctld at {}:{}: {e}", self.host, self.port))?;
		self.stream = Some(BufReader::new(stream));
		Ok(())
	}

	fn disconnect(&mut self) {
		self.stream = None;
	}

	async fn poll(&mut self) -> Result<RawReading, String> {
		let frequency_hz = self.get_frequency().await?;
		let mode_raw = self.get_mode().await?;
		Ok(RawReading {
			frequency_hz: Some(frequency_hz),
			mode_raw: Some(mode_raw),
		})
	}
}

/// Maps hamlib CAT mode tokens to logrs's mode list (src/types/index.ts MODES).
///
/// Digital sub-modes (PKTUSB, PKTLSB, ...) are intentionally left unmapped:
/// the radio only reports the underlying CAT mode, not the actual digital
/// protocol (FT8 vs FT4 vs PSK31 all look like "PKTUSB" over CAT), so we
/// can't auto-fill that field reliably without something like WSJT-X's UDP
/// integration. Leaving it as None means the mode field is left for the
/// user to set manually in that case, rather than guessing wrong.
pub fn map_mode(raw: &str) -> Option<String> {
	match raw.to_uppercase().as_str() {
		"USB" | "LSB" => Some("SSB".to_string()),
		"CW" | "CWR" => Some("CW".to_string()),
		"AM" => Some("AM".to_string()),
		"FM" | "WFM" => Some("FM".to_string()),
		"RTTY" | "RTTYR" => Some("RTTY".to_string()),
		_ => None,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn maps_known_modes() {
		assert_eq!(map_mode("USB"), Some("SSB".to_string()));
		assert_eq!(map_mode("lsb"), Some("SSB".to_string()));
		assert_eq!(map_mode("CW"), Some("CW".to_string()));
	}

	#[test]
	fn leaves_digital_submodes_unmapped() {
		assert_eq!(map_mode("PKTUSB"), None);
		assert_eq!(map_mode("PKTLSB"), None);
	}

	#[tokio::test]
	async fn polls_a_real_tcp_connection_like_rigctld() {
		use tokio::io::AsyncReadExt;
		use tokio::net::TcpListener;

		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let addr = listener.local_addr().unwrap();

		tokio::spawn(async move {
			let (mut socket, _) = listener.accept().await.unwrap();
			let mut buf = [0u8; 64];

			// "f" -> frequency
			let n = socket.read(&mut buf).await.unwrap();
			assert_eq!(&buf[..n], b"f\n");
			socket.write_all(b"14074000\n").await.unwrap();

			// "m" -> mode + passband (digital sub-mode, intentionally ambiguous)
			let n = socket.read(&mut buf).await.unwrap();
			assert_eq!(&buf[..n], b"m\n");
			socket.write_all(b"PKTUSB\n2400\n").await.unwrap();
		});

		let mut provider = HamlibProvider::new(addr.ip().to_string(), addr.port());
		provider.connect().await.unwrap();
		let reading = provider.poll().await.unwrap();

		assert_eq!(reading.frequency_hz, Some(14_074_000));
		assert_eq!(reading.mode_raw, Some("PKTUSB".to_string()));
		// Confirms the end-to-end pipeline: real frequency -> correct band,
		// but the digital sub-mode stays unmapped rather than guessing.
		assert_eq!(
			super::super::band::band_for_frequency(reading.frequency_hz.unwrap()),
			Some("20m".to_string())
		);
		assert_eq!(map_mode(&reading.mode_raw.unwrap()), None);
	}
}
