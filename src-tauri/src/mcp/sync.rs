use super::{
    Connection, Library, Local, Server,
    adapters::{self, Adapter},
};
use crate::{
    agents::{self, Definition},
    storage,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Applied {
    path: PathBuf,
    previous: Option<String>,
    expected: Option<String>,
    #[serde(default)]
    imported: Option<Value>,
}

type AppliedMap = BTreeMap<String, BTreeMap<String, Applied>>;

#[derive(Serialize)]
pub struct Discovered {
    key: String,
    supported: bool,
}

#[derive(Serialize)]
pub struct AgentView {
    id: String,
    name: String,
    folder: Option<PathBuf>,
    override_folder: Option<PathBuf>,
    config_file: Option<PathBuf>,
    enabled: bool,
    hidden: bool,
    supports_http: bool,
    discovered: Vec<Discovered>,
    applied: usize,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct Snapshot {
    servers: Vec<Server>,
    agents: Vec<AgentView>,
    theme: String,
    locale: String,
    text_size: super::TextSize,
    issues: Vec<Issue>,
}

#[derive(Serialize)]
struct Issue {
    agent: String,
    server: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Add {
        name: String,
        description: String,
        connection: Connection,
    },
    Describe {
        server: String,
        description: String,
    },
    Remove {
        server: String,
    },
    Global {
        server: String,
        enabled: bool,
    },
    Assign {
        server: String,
        agent: String,
        enabled: bool,
    },
    Manage {
        agent: String,
        enabled: bool,
    },
    Hide {
        agent: String,
        hidden: bool,
    },
    Folder {
        agent: String,
        folder: Option<PathBuf>,
    },
    Adopt {
        agent: String,
        key: String,
    },
    Settings {
        theme: String,
        locale: String,
    },
    TextSize {
        size: super::TextSize,
    },
    AgentOrder {
        ids: Vec<String>,
    },
    Retry,
}

pub struct Workspace {
    home: PathBuf,
    data: PathBuf,
    definitions: Vec<Definition>,
    library: Library,
    local: Local,
    applied: AppliedMap,
    issues: Vec<Issue>,
}

impl Workspace {
    pub fn open(home: PathBuf, data: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data).map_err(|error| error.to_string())?;
        let library = load_library(&data)?;
        if !data.join("library.json").exists() {
            storage::save(&data.join("library.json"), &library)?;
        }
        let mut workspace = Self {
            home,
            local: storage::load(&data.join("local.json"))?,
            applied: storage::load(&data.join("applied.json"))?,
            data,
            definitions: agents::definitions()?,
            library,
            issues: Vec::new(),
        };
        workspace.reconcile(false);
        Ok(workspace)
    }

    fn definition(&self, id: &str) -> Result<&Definition, String> {
        self.definitions
            .iter()
            .find(|definition| definition.id == id)
            .ok_or_else(|| "Unknown agent".into())
    }

    fn folder(&self, definition: &Definition) -> Option<PathBuf> {
        definition.folder(
            &self.home,
            self.local
                .agents
                .get(&definition.id)
                .and_then(|state| state.folder.as_deref()),
        )
    }

    fn save_applied(&self) -> Result<(), String> {
        storage::save(&self.data.join("applied.json"), &self.applied)
    }

    fn server_mut(&mut self, id: &str) -> Result<&mut Server, String> {
        self.library
            .servers
            .iter_mut()
            .find(|server| server.id == id)
            .ok_or_else(|| "Unknown server".into())
    }

    fn reload(&mut self) -> Result<(), String> {
        let library = load_library(&self.data)?;
        let local = storage::load(&self.data.join("local.json"))?;
        let applied = storage::load(&self.data.join("applied.json"))?;
        self.library = library;
        self.local = local;
        self.applied = applied;
        Ok(())
    }

    pub fn refresh(&mut self) -> Result<Snapshot, String> {
        self.reload()?;
        self.reconcile(false);
        Ok(self.snapshot())
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut agents: Vec<_> = self
            .definitions
            .iter()
            .map(|definition| {
                let state = self.local.agents.get(&definition.id);
                let folder = self.folder(definition);
                let mut view = AgentView {
                    id: definition.id.clone(),
                    name: definition.name.clone(),
                    folder: folder.clone(),
                    override_folder: state.and_then(|state| state.folder.clone()),
                    config_file: None,
                    enabled: state.is_some_and(|state| state.enabled),
                    hidden: state.is_some_and(|state| state.hidden),
                    supports_http: false,
                    discovered: Vec::new(),
                    applied: 0,
                    error: None,
                };
                let result = (|| -> Result<(), String> {
                    let adapter = adapters::get(&definition.adapter)?;
                    view.supports_http = adapter.supports_http();
                    let Some(folder) = folder else {
                        return Ok(());
                    };
                    let path = config_path(adapter, &folder, &self.home)?;
                    view.config_file = Some(path.clone());
                    let source = storage::read(&path)?.unwrap_or_default();
                    for (key, value) in adapter.read(&source)? {
                        let hash = storage::fingerprint(&value);
                        let managed = self.library.servers.iter().any(|server| {
                            server.key == key
                                && self
                                    .applied
                                    .get(&server.id)
                                    .and_then(|agents| agents.get(&definition.id))
                                    .is_some_and(|record| {
                                        record.path == path
                                            && (record.expected.as_ref() == Some(&hash)
                                                || record.previous.as_ref() == Some(&hash))
                                    })
                        });
                        if managed {
                            view.applied += usize::from(native_enabled(&value));
                        } else {
                            view.discovered.push(Discovered {
                                key,
                                supported: adapter
                                    .decode(&value)
                                    .is_some_and(|connection| connection.validate().is_ok()),
                            });
                        }
                    }
                    Ok(())
                })();
                view.error = result.err();
                view
            })
            .collect();
        agents.sort_by_key(|agent| {
            self.local
                .agent_order
                .iter()
                .position(|id| id == &agent.id)
                .unwrap_or(usize::MAX)
        });
        Snapshot {
            servers: self.library.servers.clone(),
            agents,
            theme: self.local.theme.clone(),
            locale: self.local.locale.clone(),
            text_size: self.local.text_size,
            issues: self
                .issues
                .iter()
                .map(|issue| Issue {
                    agent: issue.agent.clone(),
                    server: issue.server.clone(),
                    message: issue.message.clone(),
                })
                .collect(),
        }
    }

    pub fn change(&mut self, action: Action) -> Result<Snapshot, String> {
        // Reload durable state after a previous partial failure.
        self.reload()?;
        let mut sync = true;
        match action {
            Action::Add {
                name,
                description,
                connection,
            } => {
                connection.validate()?;
                let key = name.trim().to_owned();
                if key.is_empty()
                    || !key
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || "_-".contains(ch))
                {
                    return Err(
                        "Use letters, digits, dashes or underscores for the server name".into(),
                    );
                }
                if self.library.servers.iter().any(|server| server.key == key) {
                    return Err("This server name is already in the library".into());
                }
                self.library.servers.push(Server {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: key.clone(),
                    key,
                    description,
                    connection,
                    enabled: true,
                    agents: BTreeSet::new(),
                });
                sync = false;
            }
            Action::Describe {
                server,
                description,
            } => {
                self.server_mut(&server)?.description = description;
                sync = false;
            }
            Action::Remove { server } => {
                self.server_mut(&server)?.enabled = false;
                storage::save(&self.data.join("library.json"), &self.library)?;
                self.reconcile(true);
                if self.issues.iter().any(|issue| issue.server == server) {
                    return Ok(self.snapshot());
                }
                self.library.servers.retain(|item| item.id != server);
                storage::save(&self.data.join("library.json"), &self.library)?;
                self.applied.remove(&server);
                self.save_applied()?;
                return Ok(self.snapshot());
            }
            Action::Global { server, enabled } => self.server_mut(&server)?.enabled = enabled,
            Action::Assign {
                server,
                agent,
                enabled,
            } => {
                let adapter = adapters::get(&self.definition(&agent)?.adapter)?;
                let item = self.server_mut(&server)?;
                if enabled {
                    if matches!(item.connection, Connection::Http { .. })
                        && !adapter.supports_http()
                    {
                        return Err(
                            "This agent does not support HTTP in its local configuration".into(),
                        );
                    }
                    item.agents.insert(agent);
                } else {
                    item.agents.remove(&agent);
                }
            }
            Action::Manage { agent, enabled } => {
                self.definition(&agent)?;
                self.local.agents.entry(agent).or_default().enabled = enabled;
            }
            Action::Hide { agent, hidden } => {
                self.definition(&agent)?;
                self.local.agents.entry(agent).or_default().hidden = hidden;
                sync = false;
            }
            Action::Folder { agent, folder } => {
                self.definition(&agent)?;
                if folder
                    .as_ref()
                    .is_some_and(|path| !path.is_absolute() || !path.is_dir())
                {
                    return Err("Choose an existing folder using an absolute path".into());
                }
                self.local.agents.entry(agent).or_default().folder = folder;
            }
            Action::Adopt { agent, key } => {
                self.adopt(&agent, &key)?;
                sync = false;
            }
            Action::Settings { theme, locale } => {
                if !["light", "dark"].contains(&theme.as_str())
                    || !["en", "ru", "uk", "zh-CN", "es", "de", "ja"].contains(&locale.as_str())
                {
                    return Err("Unknown theme or language".into());
                }
                self.local.theme = theme;
                self.local.locale = locale;
                sync = false;
            }
            Action::TextSize { size } => {
                self.local.text_size = size;
                sync = false;
            }
            Action::AgentOrder { ids } => {
                let expected: BTreeSet<_> =
                    self.definitions.iter().map(|agent| &agent.id).collect();
                if ids.len() != expected.len() || ids.iter().collect::<BTreeSet<_>>() != expected {
                    return Err("Agent order must contain every agent exactly once".into());
                }
                self.local.agent_order = ids;
                sync = false;
            }
            Action::Retry => {}
        }
        storage::save(&self.data.join("library.json"), &self.library)?;
        storage::save(&self.data.join("local.json"), &self.local)?;
        if sync {
            self.reconcile(true);
        }
        Ok(self.snapshot())
    }

    fn adopt(&mut self, agent: &str, key: &str) -> Result<(), String> {
        let definition = self.definition(agent)?;
        let adapter = adapters::get(&definition.adapter)?;
        let folder = self
            .folder(definition)
            .ok_or("Agent settings folder not found")?;
        let path = config_path(adapter, &folder, &self.home)?;
        let source = storage::read(&path)?.ok_or("Agent configuration was not found")?;
        let value = adapter
            .read(&source)?
            .remove(key)
            .ok_or("Server entry no longer exists")?;
        let connection = adapter
            .decode(&value)
            .ok_or("This server uses an unsupported configuration")?;
        connection.validate()?;
        let enabled = native_enabled(&value);
        let id = if let Some(existing) = self
            .library
            .servers
            .iter_mut()
            .find(|server| server.key == key)
        {
            if existing.connection != connection || (enabled && !existing.enabled) {
                return Err("This key belongs to a different or disabled library server".into());
            }
            if self
                .applied
                .get(&existing.id)
                .and_then(|agents| agents.get(agent))
                .is_some()
            {
                return Err("This key is already recorded for this agent".into());
            }
            if enabled {
                existing.agents.insert(agent.into());
            }
            existing.id.clone()
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            self.library.servers.push(Server {
                id: id.clone(),
                key: key.into(),
                name: key.into(),
                description: String::new(),
                enabled,
                connection,
                agents: BTreeSet::from([agent.into()]),
            });
            id
        };
        let hash = storage::fingerprint(&value);
        self.applied.entry(id).or_default().insert(
            agent.into(),
            Applied {
                path,
                previous: Some(hash.clone()),
                expected: Some(hash),
                imported: Some(value),
            },
        );
        self.save_applied()?;
        self.local.agents.entry(agent.into()).or_default().enabled = true;
        Ok(())
    }

    fn reconcile(&mut self, write: bool) {
        self.issues.clear();
        for server in self.library.servers.clone() {
            let mut targets = server.agents.clone();
            if let Some(records) = self.applied.get(&server.id) {
                targets.extend(records.keys().cloned());
            }
            for agent in targets {
                if let Err(message) = self.apply(&server, &agent, write) {
                    self.issues.push(Issue {
                        server: server.id.clone(),
                        agent,
                        message,
                    });
                }
            }
        }
    }

    fn apply(&mut self, server: &Server, agent: &str, write: bool) -> Result<(), String> {
        let definition = self.definition(agent)?;
        let adapter = adapters::get(&definition.adapter)?;
        let wanted = server.enabled
            && server.agents.contains(agent)
            && self
                .local
                .agents
                .get(agent)
                .is_some_and(|state| state.enabled);
        let previous = self
            .applied
            .get(&server.id)
            .and_then(|agents| agents.get(agent))
            .cloned();
        if !wanted
            && previous
                .as_ref()
                .is_none_or(|record| record.previous.is_none() && record.expected.is_none())
        {
            return Ok(());
        }
        let folder = self
            .folder(definition)
            .ok_or("Agent settings folder not found")?;
        let path = config_path(adapter, &folder, &self.home)?;
        if previous.as_ref().is_some_and(|record| {
            record.path != path && (record.previous.is_some() || record.expected.is_some())
        }) {
            return Err("Managed entry points to a different file. Restore the old folder before moving it.".into());
        }
        let source = storage::read(&path)?;
        let content = source.as_deref().unwrap_or_default();
        let current = adapter
            .read(content)?
            .get(&server.key)
            .map(storage::fingerprint);
        if previous.as_ref().is_some_and(|record| {
            record.path == path && record.previous != current && record.expected != current
        }) || (previous.as_ref().is_none_or(|record| record.path != path) && current.is_some())
        {
            return Err(
                "Configuration conflict: the entry exists or was changed outside Patchbay".into(),
            );
        }
        let imported = previous.and_then(|record| record.imported);
        let value = if wanted {
            if matches!(server.connection, Connection::Http { .. }) && !adapter.supports_http() {
                return Err("HTTP is unavailable for this agent".into());
            }
            Some(match imported.as_ref() {
                Some(value) => activate_native(value.clone()),
                None => adapter.encode(&server.connection)?,
            })
        } else {
            None
        };
        let expected = value.as_ref().map(storage::fingerprint);
        if !write {
            return if current == expected {
                Ok(())
            } else {
                Err("Configuration changes are pending. Retry to apply them.".into())
            };
        }
        let record = Applied {
            path: path.clone(),
            previous: current.clone(),
            expected: expected.clone(),
            imported,
        };
        self.applied
            .entry(server.id.clone())
            .or_default()
            .insert(agent.into(), record);
        self.save_applied()?;
        if current != expected {
            let updated = adapter.update(content, &server.key, value)?;
            if storage::read(&path)? != source {
                return Err(
                    "Configuration changed during the update. Retry to review the current version."
                        .into(),
                );
            }
            storage::atomic_write(&path, &updated)?;
            self.applied
                .get_mut(&server.id)
                .unwrap()
                .get_mut(agent)
                .unwrap()
                .previous = expected;
            self.save_applied()?;
        }
        Ok(())
    }
}

fn load_library(data: &Path) -> Result<Library, String> {
    let stored = storage::read(&data.join("library.json"))?;
    let source = stored
        .as_deref()
        .unwrap_or(include_str!("../../resources/library.json"));
    let library: Library = serde_json::from_str(source).map_err(|error| error.to_string())?;
    if library.version != 1 {
        return Err("Unsupported library format".into());
    }
    Ok(library)
}

fn native_enabled(value: &Value) -> bool {
    value.get("enabled") != Some(&Value::Bool(false))
        && value.get("disabled") != Some(&Value::Bool(true))
}

fn activate_native(mut value: Value) -> Value {
    if let Some(entry) = value.as_object_mut() {
        if entry.get("enabled") == Some(&Value::Bool(false)) {
            entry.insert("enabled".into(), Value::Bool(true));
        }
        if entry.get("disabled") == Some(&Value::Bool(true)) {
            entry.remove("disabled");
        }
    }
    value
}

fn config_path(adapter: &dyn Adapter, folder: &Path, home: &Path) -> Result<PathBuf, String> {
    let path = adapter.path(folder, home);
    match path.canonicalize() {
        Ok(path) if path.is_file() => Ok(path),
        Ok(_) => Err("Agent configuration path is not a file".into()),
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound
                && fs::symlink_metadata(&path).is_err() =>
        {
            let parent = path
                .parent()
                .ok_or("Invalid configuration path")?
                .canonicalize()
                .map_err(|error| error.to_string())?;
            Ok(parent.join(path.file_name().ok_or("Invalid configuration name")?))
        }
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests;
