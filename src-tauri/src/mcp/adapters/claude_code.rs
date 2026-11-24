use super::Connection;
use super::{Adapter, Entries, read_json, update_json};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct ClaudeCode;

impl Adapter for ClaudeCode {
    fn path(&self, folder: &Path, home: &Path) -> PathBuf {
        let custom = folder.join(".claude.json");
        let is_default = home.join(".claude").canonicalize().ok().as_deref() == Some(folder);
        if is_default && !custom.exists() {
            home.join(".claude.json")
        } else {
            custom
        }
    }
    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json(source, "mcpServers")
    }
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json(source, "mcpServers", key, value)
    }
    fn encode(&self, connection: &Connection) -> Result<Value, String> {
        let mut value = super::encode_standard(connection);
        value["type"] = match connection {
            Connection::Http { .. } => "http".into(),
            _ => "stdio".into(),
        };
        Ok(value)
    }
}
