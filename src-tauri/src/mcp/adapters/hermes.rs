use super::{Adapter, Entries, yaml};
use serde_json::Value;
use std::path::{Path, PathBuf};
use yaml_edit::Mapping;

pub struct Hermes;

impl Adapter for Hermes {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf {
        folder.join("config.yaml")
    }

    fn read(&self, source: &str) -> Result<Entries, String> {
        let file = yaml::document(source, "{}\n")?;
        let root = file
            .documents()
            .next()
            .and_then(|doc| doc.as_mapping())
            .ok_or("Expected a Hermes configuration mapping")?;
        yaml::child(&root, "mcp_servers")?
            .map_or_else(|| Ok(Entries::new()), |servers| yaml::entries(&servers))
    }

    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String> {
        let file = yaml::document(source, "{}\n")?;
        let root = file
            .documents()
            .next()
            .and_then(|doc| doc.as_mapping())
            .ok_or("Expected a Hermes configuration mapping")?;
        if value.is_some() && yaml::child(&root, "mcp_servers")?.is_none() {
            if root.get("<<").is_some() {
                return Err("Cannot create mcp_servers over inherited YAML settings".into());
            }
            root.set("mcp_servers", Mapping::new_flow());
        }
        if let Some(servers) = yaml::child(&root, "mcp_servers")? {
            yaml::entries(&servers)?;
            if let Some(value) = value {
                servers.set(key, yaml::yaml_value(value)?);
            } else {
                servers.remove(key);
            }
        }
        Ok(file.to_string())
    }
}
