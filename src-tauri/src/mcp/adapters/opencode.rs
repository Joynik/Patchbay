use super::{Adapter, Connection, Entries, json_document, read_json_path, update_json_path};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

pub struct OpenCode;

fn section(source: &str) -> Result<&'static [&'static str], String> {
    let document = json_document(source)?;
    let Some(mcp) = document.get("mcp") else {
        return Ok(&["mcp", "servers"]);
    };
    let mcp = mcp
        .as_object()
        .ok_or("Expected an MCP configuration object")?;
    // Keep writing the format already used by the file.
    if mcp
        .get("servers")
        .is_some_and(|entry| entry.get("type").is_none())
        || mcp.values().any(|entry| !entry.is_object())
    {
        Ok(&["mcp", "servers"])
    } else {
        Ok(&["mcp"])
    }
}

impl Adapter for OpenCode {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        let json = folder.join("opencode.json");
        let jsonc = folder.join("opencode.jsonc");
        if json.exists() || !jsonc.exists() {
            json
        } else {
            jsonc
        }
    }

    fn read(&self, source: &str) -> Result<Entries, String> {
        read_json_path(source, section(source)?)
    }

    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        update_json_path(source, section(source)?, key, value)
    }

    fn decode(&self, value: &Value) -> Option<Connection> {
        match value["type"].as_str()? {
            "local" => {
                let mut parts: Vec<String> =
                    serde_json::from_value(value["command"].clone()).ok()?;
                if parts.is_empty() {
                    return None;
                }
                let command = parts.remove(0);
                Some(Connection::Stdio {
                    command,
                    args: parts,
                })
            }
            "remote" => Some(Connection::Http {
                url: value["url"].as_str()?.into(),
            }),
            _ => None,
        }
    }

    fn encode(&self, connection: &Connection) -> Result<Value, String> {
        Ok(match connection {
            Connection::Stdio { command, args } => {
                json!({"type":"local", "command":std::iter::once(command).chain(args).collect::<Vec<_>>()})
            }
            Connection::Http { url } => json!({"type":"remote", "url":url}),
        })
    }
}
