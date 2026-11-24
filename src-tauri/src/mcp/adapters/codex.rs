use super::{Adapter, Entries};
use serde_json::Value;
use std::path::{Path, PathBuf};
use toml_edit::{DocumentMut, Item, Table, de, ser};

pub struct Codex;

impl Adapter for Codex {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("config.toml")
    }

    fn read(&self, source: &str) -> Result<Entries, String> {
        let document: Value = de::from_str(source)
            .map_err(|error| format!("Invalid TOML configuration at bytes {:?}", error.span()))?;
        match document.get("mcp_servers") {
            None => Ok(Entries::new()),
            Some(Value::Object(entries)) => Ok(entries.clone()),
            _ => Err("Expected a table at mcp_servers".into()),
        }
    }

    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        let mut document = source
            .parse::<DocumentMut>()
            .map_err(|error| error.to_string())?;
        let section = document
            .entry("mcp_servers")
            .or_insert(Item::Table(Table::new()));
        let table = section
            .as_table_like_mut()
            .ok_or("Expected a table at mcp_servers")?;
        match value {
            Some(value) => {
                let entry = ser::to_document(&value).map_err(|error| error.to_string())?;
                table.insert(key, Item::Table(entry.into_table()));
            }
            None => {
                table.remove(key);
            }
        }
        Ok(document.to_string())
    }
}
