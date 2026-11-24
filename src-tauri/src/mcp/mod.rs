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
    pub hidden: bool,
    pub folder: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TextSize {
    Small,
    #[default]
    Default,
    Large,
    ExtraLarge,
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
