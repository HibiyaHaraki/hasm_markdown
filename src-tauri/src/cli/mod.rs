pub mod args;
pub mod preview;
pub mod verify;

use args::Command;

pub fn execute(command: Command) -> Result<Option<std::path::PathBuf>, String> {
    match command {
        Command::Verify { path, json } => { std::process::exit(verify::execute(&path, json)); }
        Command::Preview { path } => { preview::execute(&path)?; std::process::exit(0); }
        Command::Open { path } => Ok(path),
    }
}
