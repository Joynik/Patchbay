use super::{Adapter, Entries, read_json, update_json};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct Pi;

impl Adapter for Pi {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("mcp.json")
    }
    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json(source, "mcpServers")
    }
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json(source, "mcpServers", key, value)
    }
}
