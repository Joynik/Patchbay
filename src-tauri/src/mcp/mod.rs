pub mod adapters;
pub mod sync;

use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Connection {
    Stdio { command: String, args: Vec<String> },
    Http { url: String },
}

impl Connection {
    pub fn validate_input(&self, previous: Option<&Self>) -> Result<(), String> {
        if let Self::Stdio { command, args } = self {
            let (old_command, old_args) = match previous {
                Some(Self::Stdio { command, args }) => (Some(command), Some(args)),
                _ => (None, None),
            };
            if old_command != Some(command) && !valid_command(command) {
                return Err(
                    "Enter an executable name or path. Put its arguments in the Arguments field."
                        .into(),
                );
            }
            if old_args != Some(args)
                && args.iter().any(|argument| {
                    argument.trim().is_empty() || argument.chars().any(char::is_control)
                })
            {
                return Err(
                    "Enter one non-blank argument per line without control characters.".into(),
                );
            }
        }
        self.validate()
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Stdio { command, .. } if command.trim().is_empty() => {
                Err("Enter a command".into())
            }
            Self::Http { url } => {
                let endpoint = url::Url::parse(url).map_err(|_| "Enter a valid URL")?;
                if !matches!(endpoint.scheme(), "http" | "https")
                    || endpoint.host_str().is_none()
                    || !endpoint.username().is_empty()
                    || endpoint.password().is_some()
                {
                    return Err("Enter an HTTP(S) URL without embedded credentials".into());
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

fn valid_command(command: &str) -> bool {
    if command.is_empty() || command != command.trim() || command.chars().any(char::is_control) {
        return false;
    }
    if command.starts_with('/') || command.starts_with("./") || command.starts_with("../") {
        return !command.ends_with('/');
    }
    !matches!(command, "." | "..")
        && command
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "_.+@-".contains(ch))
}

pub fn validate_server_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "_-".contains(ch))
    {
        return Err(
            "Use only Latin letters, digits, hyphens or underscores for the server name".into(),
        );
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Server {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub connection: Connection,
    pub agents: BTreeSet<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Library {
    pub version: u8,
    pub servers: Vec<Server>,
}
#[derive(Default, Debug, Deserialize, Serialize)]
pub struct AgentSettings {
    pub enabled: bool,
    pub folder: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TextSize {
    #[default]
    Small,
    Default,
    #[serde(alias = "extra_large")]
    Large,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Local {
    pub theme: String,
    pub locale: String,
    #[serde(default)]
    pub text_size: TextSize,
    #[serde(default)]
    pub agent_order: Vec<String>,
    pub agents: BTreeMap<String, AgentSettings>,
}
impl Default for Local {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            locale: "en".into(),
            text_size: TextSize::default(),
            agent_order: Vec::new(),
            agents: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_user_input_without_rejecting_unchanged_legacy_arguments() {
        assert!(validate_server_name("valid-name_2").is_ok());
        for name in ["bad name", "bad/name", "leading ", ""] {
            assert!(validate_server_name(name).is_err(), "{name:?}");
        }

        let stdio = |command: &str, args: &[&str]| Connection::Stdio {
            command: command.into(),
            args: args.iter().map(|arg| (*arg).into()).collect(),
        };
        let valid = stdio(
            "/Applications/My Tool/bin/runner",
            &["--label", "two words"],
        );
        assert!(valid.validate_input(None).is_ok());
        for invalid in [
            stdio("runner --flag", &[]),
            stdio("runner\t", &[]),
            stdio("runner", &["  "]),
            stdio("runner", &["two\nlines"]),
        ] {
            assert!(invalid.validate_input(None).is_err(), "{invalid:?}");
        }
        let legacy = stdio("runner", &[""]);
        assert!(legacy.validate_input(Some(&legacy)).is_ok());
    }
}
