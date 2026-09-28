#![cfg(windows)]

use enouia_activity_delivery::curl_fetch::CurlPublicFetcher;
use enouia_activity_delivery::public_fetch::{FetchError, PublicFetcher};
use enouia_common::{
    Cancellation, ComponentId, ProcessOutput, ProcessRequest, ProcessRunner, StructuredError,
};
use enouia_windows_process::WindowsProcessRunner;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

struct NeverCancelled;

impl Cancellation for NeverCancelled {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn installed_curl() -> PathBuf {
    let path = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows root"))
        .join("System32/curl.exe");
    assert!(path.is_file(), "installed Windows curl is required");
    path
}

fn serve(response: &'static [u8]) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!(
        "http://{}/status-data/current.json",
        listener.local_addr().unwrap()
    );
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = [0; 2048];
        let count = stream.read(&mut request).unwrap();
        assert!(request[..count].starts_with(b"GET /status-data/current.json HTTP/"));
        stream.write_all(response).unwrap();
    });
    (url, handle)
}

#[test]
fn real_local_http_success_and_redirect_rejection() {
    let executable = installed_curl();
    let runner = WindowsProcessRunner::new(ComponentId::ActivityCollectorGithub);
    let fetcher = CurlPublicFetcher {
        executable: &executable,
        runner: &runner,
    };
    let (url, server) = serve(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\na\0b");
    let result = fetcher
        .fetch(&url, 3, Duration::from_secs(5), &NeverCancelled)
        .unwrap();
    server.join().unwrap();
    assert_eq!(result.status, 200);
    assert_eq!(result.final_url, url);
    assert!(!result.redirected);
    assert_eq!(result.body, b"a\0b");

    let (url, server) = serve(
        b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/other\r\nContent-Length: 0\r\n\r\n",
    );
    let result = fetcher
        .fetch(&url, 3, Duration::from_secs(5), &NeverCancelled)
        .unwrap();
    server.join().unwrap();
    assert_eq!(result.status, 302);
    assert!(result.redirected);
}

#[test]
fn real_local_http_enforces_body_limit() {
    let executable = installed_curl();
    let runner = WindowsProcessRunner::new(ComponentId::ActivityCollectorGithub);
    let fetcher = CurlPublicFetcher {
        executable: &executable,
        runner: &runner,
    };
    let (url, server) = serve(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello");
    let result = fetcher.fetch(&url, 4, Duration::from_secs(5), &NeverCancelled);
    server.join().unwrap();
    assert!(matches!(result, Err(FetchError::TooLarge)));
}

struct SuccessfulRunner;

impl ProcessRunner for SuccessfulRunner {
    fn run(
        &self,
        request: &ProcessRequest,
        _: &dyn Cancellation,
    ) -> Result<ProcessOutput, StructuredError> {
        assert_eq!(
            request.arguments.last().unwrap(),
            "http://localhost/status-data/current.json"
        );
        Ok(ProcessOutput {
            exit_code: Some(0),
            stdout: b"ok".to_vec(),
            stderr: b"__ENOUIA_HTTP_STATUS__:200\r\n".to_vec(),
        })
    }
}

#[test]
fn accepts_valid_loopback_origin_without_explicit_port() {
    let executable = installed_curl();
    let runner = SuccessfulRunner;
    let fetcher = CurlPublicFetcher {
        executable: &executable,
        runner: &runner,
    };
    let response = fetcher
        .fetch(
            "http://localhost/status-data/current.json",
            2,
            Duration::from_secs(1),
            &NeverCancelled,
        )
        .unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(response.body, b"ok");
}

#[test]
fn real_local_http_obeys_subsecond_deadline() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/slow", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0; 1024];
        assert!(stream.read(&mut request).unwrap() > 0);
        thread::sleep(Duration::from_millis(500));
    });
    let executable = installed_curl();
    let runner = WindowsProcessRunner::new(ComponentId::ActivityCollectorGithub);
    let fetcher = CurlPublicFetcher {
        executable: &executable,
        runner: &runner,
    };
    let started = Instant::now();
    let result = fetcher.fetch(&url, 16, Duration::from_millis(100), &NeverCancelled);
    let elapsed = started.elapsed();
    server.join().unwrap();
    assert!(matches!(
        result,
        Err(FetchError::Timeout | FetchError::Unavailable)
    ));
    assert!(elapsed < Duration::from_millis(400), "elapsed {elapsed:?}");
}
