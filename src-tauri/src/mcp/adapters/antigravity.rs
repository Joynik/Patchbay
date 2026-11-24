use super::Connection;
use super::{Adapter, Entries, read_json, update_json};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct Antigravity;

impl Adapter for Antigravity {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("mcp_config.json")
    }
    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json(source, "mcpServers")
    }
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json(source, "mcpServers", key, value)
    }
    fn decode(&self, value: &Value) -> Option<Connection> {
        value
            .get("serverUrl")
            .and_then(Value::as_str)
            .map(|url| Connection::Http { url: url.into() })
            .or_else(|| super::decode_standard(value))
    }
    fn encode(&self, connection: &Connection) -> Result<Value, String> {
        Ok(match connection {
            Connection::Http { url } => serde_json::json!({ "serverUrl": url }),
            _ => super::encode_standard(connection),
        })
    }
}
