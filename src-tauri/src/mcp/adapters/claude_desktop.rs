use super::Connection;
use super::{Adapter, Entries, read_json, update_json};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct ClaudeDesktop;

impl Adapter for ClaudeDesktop {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("claude_desktop_config.json")
    }
    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json(source, "mcpServers")
    }
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json(source, "mcpServers", key, value)
    }
    fn supports_http(&self) -> bool {
        false
    }
    fn decode(&self, value: &Value) -> Option<Connection> {
        super::decode_standard(value).filter(|entry| matches!(entry, Connection::Stdio { .. }))
    }
}
