use std::path::PathBuf;

pub enum Command {
    Verify { path: PathBuf, json: bool },
    Preview { path: PathBuf },
    Open { path: Option<PathBuf> },
}

pub fn parse(args: impl Iterator<Item = String>) -> Result<Option<Command>, String> {
    // REQ-MD-01-001: map verify, preview, open, and direct-path invocation.
    let mut values = args.skip(1);
    let first = match values.next() { Some(value) => value, None => return Ok(Some(Command::Open { path: None })) };
    match first.as_str() {
        "verify" => {
            let path = values.next().ok_or_else(|| "verify requires <PATH>".to_string())?;
            let json = values.any(|value| value == "--json");
            Ok(Some(Command::Verify { path: PathBuf::from(path), json }))
        }
        "preview" => {
            let path = values.next().ok_or_else(|| "preview requires <FOLDER_PATH>".to_string())?;
            Ok(Some(Command::Preview { path: PathBuf::from(path) }))
        }
        "open" => Ok(Some(Command::Open { path: values.next().map(PathBuf::from) })),
        value if value.starts_with('-') => Err(format!("Unknown option: {value}")),
        value => Ok(Some(Command::Open { path: Some(PathBuf::from(value)) })),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse, Command};

    #[test]
    fn parses_open_direct_path() {
        let command = parse(["hasm_markdown", "open", "workspace.hasmmd"].into_iter().map(String::from)).unwrap().unwrap();
        assert!(matches!(command, Command::Open { path: Some(path) } if path.to_string_lossy() == "workspace.hasmmd"));
    }
}
