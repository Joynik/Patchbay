use super::{Adapter, Entries, read_json, update_json};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct Gemini;

impl Adapter for Gemini {
    fn decode(&self, value: &Value) -> Option<super::Connection> {
        if value.get("url").is_some() || value["type"] == "sse" {
            return None;
        }
        if let Some(endpoint) = value.get("httpUrl") {
            if value.get("command").is_some() {
                return None;
            }
            return Some(super::Connection::Http {
                url: endpoint.as_str()?.into(),
            });
        }
        super::decode_standard(value)
    }
    fn encode(&self, connection: &super::Connection) -> Result<Value, String> {
        Ok(match connection {
            super::Connection::Http { url } => serde_json::json!({ "httpUrl": url }),
            _ => super::encode_standard(connection),
        })
    }
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("settings.json")
    }
    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json(source, "mcpServers")
    }
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json(source, "mcpServers", key, value)
    }
}
