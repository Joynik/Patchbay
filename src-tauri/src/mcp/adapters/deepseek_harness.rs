use super::{Adapter, Connection, Entries, decode_standard, encode_standard, yaml};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use yaml_edit::{Mapping, Sequence};

const CLIENT: &str = "@deepseek-ai/dsh-mcp-client";
const MANAGER: &str = "@deepseek-ai/dsh-mcp-manager";
const PREFIX: &str = "patchbay-mcp-";

pub struct DeepSeekHarness;

fn rows(file: &yaml_edit::YamlFile) -> Result<Sequence, String> {
    file.documents()
        .next()
        .and_then(|doc| doc.as_sequence())
        .ok_or("Expected a DeepSeek profile patch list".into())
}

fn text(row: &Mapping, key: &str) -> Option<String> {
    row.get(key)?.as_scalar().map(|scalar| scalar.as_string())
}

fn insert_entry(entries: &mut Entries, key: String, value: Value) -> Result<(), String> {
    if entries.insert(key, value).is_some() {
        return Err("Ambiguous DeepSeek MCP server name".into());
    }
    Ok(())
}

impl Adapter for DeepSeekHarness {
    fn path(&self, folder: &Path, _: &Path) -> PathBuf {
        folder.join("cordis.patch.yml")
    }

    fn read(&self, source: &str) -> Result<Entries, String> {
        let file = yaml::document(source, "[]\n")?;
        let mut entries = Entries::new();
        for node in rows(&file)?.values() {
            let row = node
                .as_mapping()
                .ok_or("Expected a DeepSeek profile entry")?;
            let id = text(row, "id");
            let plugin = text(row, "name");
            if plugin.as_deref() == Some(CLIENT)
                || id.as_deref().is_some_and(|id| id.starts_with(PREFIX))
            {
                let config = yaml::child(row, "config")?
                    .ok_or("Expected a DeepSeek MCP client configuration")?;
                let name = text(&config, "serverName").ok_or("DeepSeek MCP server has no name")?;
                let managed = id.as_deref() == Some(&format!("{PREFIX}{name}"))
                    && plugin.as_deref() == Some(CLIENT)
                    && row.iter().count() == 3;
                let value = if managed {
                    let mut fields = yaml::entries(&config)?;
                    fields.remove("serverName");
                    Value::Object(fields)
                } else {
                    Value::Null
                };
                insert_entry(&mut entries, name, value)?;
            } else if (plugin.as_deref() == Some(MANAGER)
                || matches!(id.as_deref(), Some("mcp" | "mcp-manager")))
                && let Some(config) = yaml::child(row, "config")?
                && let Some(servers) = yaml::child(&config, "servers")?
            {
                for key in servers.keys() {
                    let key = key
                        .as_scalar()
                        .ok_or("Invalid DeepSeek manager server name")?
                        .as_string();
                    insert_entry(&mut entries, key, Value::Null)?;
                }
            }
        }
        Ok(entries)
    }

    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        if key.is_empty()
            || key.len() > 32
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(
                "DeepSeek server names must use 1–32 letters, digits, dashes or underscores".into(),
            );
        }
        let entries = self.read(source)?;
        if entries.get(key).is_some_and(Value::is_null) {
            return Err(
                "This DeepSeek MCP entry belongs to a separate profile configuration".into(),
            );
        }
        let file = yaml::document(source, "[]\n")?;
        let rows = rows(&file)?;
        let id = format!("{PREFIX}{key}");
        let index = rows.values().position(|node| {
            node.as_mapping().and_then(|row| text(row, "id")).as_ref() == Some(&id)
        });
        if let Some(mut value) = value {
            value["serverName"] = json!(key);
            let node = yaml::yaml_value(json!({ "id": id, "name": CLIENT, "config": value }))?;
            if let Some(index) = index {
                rows.set(index, node);
            } else {
                rows.push(node);
            }
        } else if let Some(index) = index {
            rows.remove(index);
        }
        Ok(file.to_string())
    }

    fn decode(&self, value: &Value) -> Option<Connection> {
        match value.get("transport")?.as_str()? {
            "stdio" | "streamable-http" => decode_standard(value),
            _ => None,
        }
    }

    fn encode(&self, connection: &Connection) -> Result<Value, String> {
        let mut value = encode_standard(connection);
        value["transport"] = json!(match connection {
            Connection::Stdio { .. } => "stdio",
            Connection::Http { .. } => "streamable-http",
        });
        Ok(value)
    }
}
