// Controlled output for a newly owned sandbox package. It reads only the
// named reply file beside that package's config and never writes its store.
use std::io::Write;
use std::path::PathBuf;

fn main() {
    let arguments: Vec<_> = std::env::args_os().collect();
    let Some(command) = arguments.get(1).and_then(|value| value.to_str()) else {
        std::process::exit(9);
    };
    if !matches!(command, "overview" | "preview")
        || arguments.get(2).and_then(|value| value.to_str()) != Some("--config")
        || arguments.len() != 4
    {
        std::process::exit(9);
    }
    let config = PathBuf::from(&arguments[3]);
    let bytes = std::fs::read(
        config
            .parent()
            .unwrap()
            .join(format!("native-{command}-reply.json")),
    )
    .unwrap();
    std::io::stdout().write_all(&bytes).unwrap();
}
