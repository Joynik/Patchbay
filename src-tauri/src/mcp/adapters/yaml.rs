use super::Entries;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use yaml_edit::{Mapping, ScalarType, ScalarValue, YamlFile, YamlNode, YamlValue};

pub fn document(source: &str, empty: &str) -> Result<YamlFile, String> {
    let file: YamlFile = if source.trim().is_empty() {
        empty
    } else {
        source
    }
    .parse()
    .map_err(|_| "Invalid YAML configuration")?;
    if file.documents().count() != 1 {
        return Err("Expected exactly one YAML document".into());
    }
    Ok(file)
}

pub fn child(mapping: &Mapping, key: &str) -> Result<Option<Mapping>, String> {
    let matching = mapping
        .iter()
        .filter(|(node, _)| node.as_scalar().is_some_and(|s| s.as_string() == key))
        .collect::<Vec<_>>();
    match matching.as_slice() {
        [] => Ok(None),
        [(_, value)] => value
            .as_mapping()
            .cloned()
            .map(Some)
            .ok_or_else(|| format!("Expected a YAML mapping at {key}")),
        _ => Err(format!("Duplicate YAML key: {key}")),
    }
}

pub fn entries(mapping: &Mapping) -> Result<Entries, String> {
    let mut entries = Entries::new();
    for (key, value) in mapping.iter() {
        let key = key
            .as_scalar()
            .ok_or("Expected a scalar YAML key")?
            .as_string();
        if key == "<<" || entries.contains_key(&key) {
            return Err("Merged or duplicate YAML keys cannot be edited safely".into());
        }
        entries.insert(key, json_value(&value)?);
    }
    Ok(entries)
}

fn json_value(node: &YamlNode) -> Result<Value, String> {
    Ok(match node {
        YamlNode::Mapping(mapping) => Value::Object(entries(mapping)?),
        YamlNode::Sequence(sequence) => Value::Array(
            sequence
                .values()
                .map(|value| json_value(&value))
                .collect::<Result<_, _>>()?,
        ),
        YamlNode::Scalar(scalar) => match ScalarValue::from_scalar(scalar).scalar_type() {
            ScalarType::Null => Value::Null,
            ScalarType::Boolean => json!(node.to_bool().ok_or("Invalid YAML boolean")?),
            ScalarType::Integer => json!(node.to_i64().ok_or("Unsupported YAML integer")?),
            ScalarType::Float => {
                let number = node
                    .to_f64()
                    .and_then(serde_json::Number::from_f64)
                    .ok_or("Unsupported YAML number")?;
                Value::Number(number)
            }
            _ => json!(scalar.as_string()),
        },
        _ => return Err("YAML aliases or tags in MCP entries cannot be edited safely".into()),
    })
}

pub fn yaml_value(value: Value) -> Result<YamlValue, String> {
    Ok(match value {
        Value::Object(values) => values
            .into_iter()
            .map(|(key, value)| Ok((key, yaml_value(value)?)))
            .collect::<Result<BTreeMap<_, _>, String>>()?
            .into(),
        Value::Array(values) => values
            .into_iter()
            .map(yaml_value)
            .collect::<Result<Vec<_>, _>>()?
            .into(),
        Value::Null => YamlValue::scalar(ScalarValue::parse("null")),
        Value::Bool(value) => value.into(),
        Value::String(value) => value.into(),
        Value::Number(value) => YamlValue::scalar(ScalarValue::parse(value.to_string())),
    })
}
