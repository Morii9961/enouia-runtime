//! Bounded public HTTP GET using a separately configured curl executable.

use crate::public_fetch::{FetchError, FetchedResponse, PublicFetcher};
use enouia_common::{Cancellation, ProcessRequest, ProcessRunner};
use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

const METADATA_PREFIX: &[u8] = b"__ENOUIA_HTTP_STATUS__:";
const METADATA_ALLOWANCE: usize = 4096;

pub struct CurlPublicFetcher<'a, R: ProcessRunner> {
    pub executable: &'a Path,
    pub runner: &'a R,
}

impl<R: ProcessRunner> PublicFetcher for CurlPublicFetcher<'_, R> {
    fn fetch(
        &self,
        url: &str,
        max_bytes: usize,
        timeout: Duration,
        cancellation: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        if !self.executable.is_absolute()
            || !(url.starts_with("https://")
                || url.starts_with("http://localhost:")
                || url.starts_with("http://localhost/")
                || url.starts_with("http://127.0.0.1:")
                || url.starts_with("http://127.0.0.1/"))
            || url.bytes().any(|byte| byte.is_ascii_control())
            || max_bytes == 0
            || max_bytes > 4 * 1024 * 1024
            || timeout.is_zero()
        {
            return Err(FetchError::Unavailable);
        }
        let seconds = format!("{:.3}", timeout.as_secs_f64().max(0.001));
        let request = ProcessRequest {
            executable: self.executable.to_path_buf(),
            arguments: [
                "-q", // First: ignore user curlrc, including redirects and credentials.
                "--silent",
                "--show-error",
                "--globoff",
                "--path-as-is",
                "--disallow-username-in-url",
                "--no-location",
                "--max-redirs",
                "0",
                "--proto",
                "=http,https",
                "--noproxy",
                "localhost,127.0.0.1",
                "--max-filesize",
                &max_bytes.to_string(),
                "--max-time",
                &seconds,
                "--output",
                "-",
                "--write-out",
                "%{stderr}__ENOUIA_HTTP_STATUS__:%{response_code}\n",
                "--url",
                url,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            environment: Vec::new(),
            stdin: None,
            timeout,
            max_output_bytes: max_bytes + METADATA_ALLOWANCE,
        };
        let output = self
            .runner
            .run(&request, cancellation)
            .map_err(|_| FetchError::Unavailable)?;
        match output.exit_code {
            Some(28) => return Err(FetchError::Timeout),
            Some(63) => return Err(FetchError::TooLarge),
            Some(0) => {}
            _ => return Err(FetchError::Unavailable),
        }
        if output.stdout.len() > max_bytes || output.stderr.len() > METADATA_ALLOWANCE {
            return Err(FetchError::TooLarge);
        }
        let metadata = output
            .stderr
            .strip_prefix(METADATA_PREFIX)
            .and_then(|bytes| bytes.strip_suffix(b"\n"))
            .map(|bytes| bytes.strip_suffix(b"\r").unwrap_or(bytes))
            .ok_or(FetchError::Unavailable)?;
        let status = std::str::from_utf8(metadata)
            .ok()
            .filter(|text| text.len() == 3 && text.bytes().all(|byte| byte.is_ascii_digit()))
            .and_then(|text| text.parse::<u16>().ok())
            .ok_or(FetchError::Unavailable)?;
        Ok(FetchedResponse {
            status,
            final_url: url.to_owned(),
            redirected: (300..400).contains(&status),
            body: output.stdout,
        })
    }
}
