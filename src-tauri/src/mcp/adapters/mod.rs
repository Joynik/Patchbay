mod antigravity;
mod claude_code;
mod claude_desktop;
mod codex;
mod opencode;
mod pi;

use super::Connection;
use jsonc_parser::{
    ParseOptions,
    cst::{CstInputValue, CstRootNode},
    parse_to_serde_value,
};
use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};

pub type Entries = Map<String, Value>;

pub trait Adapter: Sync {
    fn path(&self, folder: &Path, _home: &Path) -> PathBuf;
    fn supports_http(&self) -> bool {
        true
    }
    fn read(&self, source: &str) -> Result<Entries, String>;
    fn update(&self, source: &str, key: &str, value: Option<Value>) -> Result<String, String>;
    fn decode(&self, value: &Value) -> Option<Connection> {
        decode_standard(value)
    }
    fn encode(&self, connection: &Connection) -> Result<Value, String> {
        Ok(encode_standard(connection))
    }
}

pub fn get(id: &str) -> Result<&'static dyn Adapter, String> {
    match id {
        "antigravity" => Ok(&antigravity::Antigravity),
        "claude_code" => Ok(&claude_code::ClaudeCode),
        "claude_desktop" => Ok(&claude_desktop::ClaudeDesktop),
        "codex" => Ok(&codex::Codex),
        "opencode" => Ok(&opencode::OpenCode),
        "pi" => Ok(&pi::Pi),
        _ => Err(format!("Unknown adapter: {id}")),
    }
}

fn parse_options() -> ParseOptions {
    ParseOptions {
        allow_comments: true,
        allow_trailing_commas: true,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
        allow_bare_decimal_point_numbers: false,
        allow_non_finite_numbers: false,
        allow_extended_string_escapes: false,
    }
}

fn json_document(source: &str) -> Result<Entries, String> {
    if source.is_empty() {
        return Ok(Map::new());
    }
    parse_to_serde_value(source, &parse_options())
        .map_err(|error| format!("Invalid JSON configuration: {error}"))
}

fn read_json(source: &str, section: &str) -> Result<Entries, String> {
    read_json_path(source, &[section])
}

fn read_json_path(source: &str, sections: &[&str]) -> Result<Entries, String> {
    let mut doc = json_document(source)?;
    for section in sections {
        doc = match doc.remove(*section) {
            None => return Ok(Map::new()),
            Some(Value::Object(entries)) => entries,
            _ => return Err(format!("Expected an object at {section}")),
        }
    }
    Ok(doc)
}

fn update_json(
    source: &str,
    section: &str,
    key: &str,
    value: Option<Value>,
) -> Result<String, String> {
    update_json_path(source, &[section], key, value)
}

fn update_json_path(
    source: &str,
    sections: &[&str],
    key: &str,
    value: Option<Value>,
) -> Result<String, String> {
    let source = if source.is_empty() { "{}\n" } else { source };
    let root = CstRootNode::parse(source, &parse_options()).map_err(|error| error.to_string())?;
    let mut entries = root
        .object_value()
        .ok_or("Expected a configuration object")?;
    for section in sections {
        entries = entries
            .object_value_or_create(section)
            .ok_or("Expected an MCP configuration object")?;
    }
    match (entries.get(key), value) {
        (Some(property), None) => property.remove(),
        (Some(property), Some(value)) => property.set_value(cst_value(value)),
        (None, Some(value)) => {
            entries.append(key, cst_value(value));
        }
        (None, None) => {}
    }
    Ok(root.to_string())
}

fn cst_value(value: Value) -> CstInputValue {
    match value {
        Value::Null => CstInputValue::Null,
        Value::Bool(value) => value.into(),
        Value::Number(value) => CstInputValue::Number(value.to_string()),
        Value::String(value) => value.into(),
        Value::Array(values) => values.into_iter().map(cst_value).collect::<Vec<_>>().into(),
        Value::Object(values) => values
            .into_iter()
            .map(|(key, value)| (key, cst_value(value)))
            .collect::<Vec<_>>()
            .into(),
    }
}

fn decode_standard(value: &Value) -> Option<Connection> {
    if value["type"] == "sse" {
        return None;
    }
    if let Some(command) = value.get("command").and_then(Value::as_str) {
        let args = value
            .get("args")
            .map(|args| serde_json::from_value(args.clone()))
            .transpose()
            .ok()?
            .unwrap_or_default();
        return Some(Connection::Stdio {
            command: command.into(),
            args,
        });
    }
    value
        .get("url")
        .and_then(Value::as_str)
        .map(|url| Connection::Http { url: url.into() })
}

fn encode_standard(connection: &Connection) -> Value {
    match connection {
        Connection::Stdio { command, args } => json!({ "command": command, "args": args }),
        Connection::Http { url } => json!({ "url": url }),
    }
}
