use serde::Deserialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(Debug, Deserialize)]
pub struct Definition {
    pub id: String,
    pub name: String,
    pub adapter: String,
    pub paths: BTreeMap<String, Vec<SearchPath>>,
}

#[derive(Debug, Deserialize)]
pub struct SearchPath {
    root: String,
    folder: String,
}

const CONFIGS: &[&str] = &[
    include_str!("../../resources/agents/codex.toml"),
    include_str!("../../resources/agents/claude_code.toml"),
    include_str!("../../resources/agents/claude_desktop.toml"),
    include_str!("../../resources/agents/pi.toml"),
    include_str!("../../resources/agents/antigravity.toml"),
    include_str!("../../resources/agents/opencode.toml"),
    include_str!("../../resources/agents/gemini.toml"),
    include_str!("../../resources/agents/oh_my_pi.toml"),
    include_str!("../../resources/agents/hermes.toml"),
    include_str!("../../resources/agents/deepseek_harness.toml"),
];

pub fn definitions() -> Result<Vec<Definition>, String> {
    CONFIGS
        .iter()
        .map(|config| toml_edit::de::from_str(config).map_err(|error| error.to_string()))
        .collect()
}

impl Definition {
    pub fn folder(&self, home: &Path, chosen: Option<&Path>) -> Option<PathBuf> {
        if let Some(chosen) = chosen {
            return chosen.canonicalize().ok().filter(|path| path.is_dir());
        }
        let paths = self.paths.get(std::env::consts::OS)?;
        paths.iter().find_map(|entry| {
            let root = match entry.root.as_str() {
                "$HOME" => home.to_path_buf(),
                "$APP_SUPPORT" => home.join("Library/Application Support"),
                "$CONFIG" => std::env::var_os("XDG_CONFIG_HOME")
                    .map(PathBuf::from)
                    .filter(|path| path.is_absolute())
                    .unwrap_or_else(|| home.join(".config")),
                root if root.starts_with("$ENV:") => std::env::var_os(&root[5..])
                    .map(PathBuf::from)
                    .filter(|path| path.is_absolute())?,
                root => PathBuf::from(root),
            };
            root.join(&entry.folder)
                .canonicalize()
                .ok()
                .filter(|path| path.is_dir())
        })
    }
}
