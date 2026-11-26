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
    connection: Option<Connection>,
    revision: String,
}

#[derive(Deserialize)]
pub struct DiscoveredTarget {
    agent: String,
    revision: String,
}

#[derive(Serialize)]
pub struct AgentView {
    id: String,
    name: String,
    folder: Option<PathBuf>,
    override_folder: Option<PathBuf>,
    config_file: Option<PathBuf>,
    enabled: bool,
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
    Edit {
        server: String,
        name: String,
        description: String,
        connection: Connection,
    },
    Remove {
        server: String,
    },
    Release {
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
    Folder {
        agent: String,
        folder: Option<PathBuf>,
    },
    Adopt {
        agents: Vec<String>,
        key: String,
        expected: Option<Connection>,
    },
    RemoveDiscovered {
        key: String,
        targets: Vec<DiscoveredTarget>,
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

    fn check_config_owner(&self, agent: &str, path: &Path) -> Result<(), String> {
        for other in self
            .definitions
            .iter()
            .filter(|definition| definition.id != agent)
        {
            let active = self
                .local
                .agents
                .get(&other.id)
                .is_some_and(|state| state.enabled);
            let recorded = self
                .applied
                .values()
                .filter_map(|agents| agents.get(&other.id))
                .any(|record| {
                    record.path == path && (record.previous.is_some() || record.expected.is_some())
                });
            let shared = active
                && self
                    .folder(other)
                    .and_then(|folder| {
                        let adapter = adapters::get(&other.adapter).ok()?;
                        config_path(adapter, &folder, &self.home).ok()
                    })
                    .as_deref()
                    == Some(path);
            if recorded || shared {
                return Err(format!(
                    "Configuration file is shared with {}. Disable its management or choose a separate folder.",
                    other.name
                ));
            }
        }
        Ok(())
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
                            let connection = adapter
                                .decode(&value)
                                .filter(|connection| connection.validate().is_ok());
                            view.discovered.push(Discovered {
                                key,
                                supported: connection.is_some(),
                                connection,
                                revision: discovery_revision(&path, &hash),
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
                super::validate_server_name(&name)?;
                connection.validate_input(None)?;
                let key = name;
                if self
                    .library
                    .servers
                    .iter()
                    .any(|server| server.key == key || server.name == key)
                {
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
            Action::Edit {
                server,
                name,
                description,
                connection,
            } => {
                if self
                    .library
                    .servers
                    .iter()
                    .any(|item| item.id != server && (item.name == name || item.key == name))
                {
                    return Err("This server name is already in the library".into());
                }
                let item = self
                    .library
                    .servers
                    .iter()
                    .find(|item| item.id == server)
                    .ok_or("Unknown server")?;
                if name != item.name {
                    super::validate_server_name(&name)?;
                }
                connection.validate_input(Some(&item.connection))?;
                let changed = item.connection != connection;
                if changed {
                    for definition in &self.definitions {
                        let imported = self
                            .applied
                            .get(&server)
                            .and_then(|records| records.get(&definition.id))
                            .and_then(|record| record.imported.as_ref());
                        if item.agents.contains(&definition.id) || imported.is_some() {
                            let adapter = adapters::get(&definition.adapter)?;
                            if matches!(connection, Connection::Http { .. })
                                && !adapter.supports_http()
                            {
                                return Err(format!(
                                    "{} does not support HTTP in its local configuration",
                                    definition.name
                                ));
                            }
                            if let Some(value) = imported {
                                edit_imported_connection(adapter, value, &connection)?;
                            }
                        }
                    }
                }
                let item = self.server_mut(&server)?;
                item.name = name;
                item.description = description;
                item.connection = connection;
                let item = item.clone();
                storage::save(&self.data.join("library.json"), &self.library)?;
                if changed {
                    self.issues.retain(|issue| issue.server != server);
                    self.reconcile_server(&item, true);
                }
                return Ok(self.snapshot());
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
            Action::Release { server } => {
                self.server_mut(&server)?;
                self.library.servers.retain(|item| item.id != server);
                storage::save(&self.data.join("library.json"), &self.library)?;
                self.applied.remove(&server);
                self.save_applied()?;
                self.reconcile(false);
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
                let definition = self.definition(&agent)?;
                if enabled {
                    let folder = self
                        .folder(definition)
                        .ok_or("Agent settings folder not found")?;
                    let path =
                        config_path(adapters::get(&definition.adapter)?, &folder, &self.home)?;
                    self.check_config_owner(&agent, &path)?;
                }
                self.local.agents.entry(agent).or_default().enabled = enabled;
            }
            Action::Folder { agent, folder } => {
                let definition = self.definition(&agent)?;
                if folder
                    .as_ref()
                    .is_some_and(|path| !path.is_absolute() || !path.is_dir())
                {
                    return Err("Choose an existing folder using an absolute path".into());
                }
                if self
                    .local
                    .agents
                    .get(&agent)
                    .is_some_and(|state| state.enabled)
                    && let Some(resolved) = definition.folder(&self.home, folder.as_deref())
                {
                    let path =
                        config_path(adapters::get(&definition.adapter)?, &resolved, &self.home)?;
                    self.check_config_owner(&agent, &path)?;
                }
                self.local.agents.entry(agent).or_default().folder = folder;
            }
            Action::Adopt {
                agents,
                key,
                expected,
            } => {
                if let Err(error) = self.adopt(&agents, &key, expected.as_ref()) {
                    self.reload()?;
                    return Err(error);
                }
                self.save_applied()?;
                sync = false;
            }
            Action::RemoveDiscovered { key, targets } => {
                self.remove_discovered(&key, &targets)?;
                self.reconcile(false);
                return Ok(self.snapshot());
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

    fn adopt(
        &mut self,
        agents: &[String],
        key: &str,
        expected: Option<&Connection>,
    ) -> Result<(), String> {
        if agents.is_empty() {
            return Err("No agent configurations to adopt".into());
        }
        let mut sources = agents
            .iter()
            .map(|agent| {
                let (path, value) = self.adoption_source(agent, key)?;
                Ok((agent, path, value))
            })
            .collect::<Result<Vec<_>, String>>()?;
        // The first active entry determines the global state of a new library server.
        sources.sort_by_key(|(_, _, value)| !native_enabled(value));
        for (agent, path, value) in sources {
            self.adopt_entry(agent, key, path, value, expected)?;
        }
        Ok(())
    }

    fn remove_discovered(&self, key: &str, targets: &[DiscoveredTarget]) -> Result<(), String> {
        if targets.is_empty() {
            return Err("No discovered entries to remove".into());
        }
        let mut files = BTreeMap::new();
        for target in targets {
            let definition = self.definition(&target.agent)?;
            let adapter = adapters::get(&definition.adapter)?;
            let folder = self
                .folder(definition)
                .ok_or("Agent settings folder not found")?;
            let path = config_path(adapter, &folder, &self.home)?;
            if self
                .library
                .servers
                .iter()
                .filter(|server| server.key == key)
                .any(|server| {
                    server.agents.contains(&target.agent)
                        || self.applied.get(&server.id).is_some_and(|records| {
                            records.values().any(|record| {
                                record.path == path
                                    && (record.previous.is_some() || record.expected.is_some())
                            })
                        })
                })
            {
                return Err(format!(
                    "{}: this entry is already managed in the library",
                    definition.name
                ));
            }

            let source = storage::read(&path)?.ok_or("Agent configuration was not found")?;
            let mut entries = adapter.read(&source)?;
            let entry = entries
                .remove(key)
                .ok_or("Server entry no longer exists. Rescan to update the list.")?;
            if discovery_revision(&path, &storage::fingerprint(&entry)) != target.revision {
                return Err(format!(
                    "{}: the discovered entry changed. Rescan before removing it.",
                    definition.name
                ));
            }
            let updated = adapter.update(&source, key, None)?;
            if adapter.read(&updated)? != entries {
                return Err(format!(
                    "{}: removing this entry would change other MCP entries",
                    definition.name
                ));
            }
            if let Some((_, previous_source, previous_update)) = files.get(&path) {
                if previous_source != &source || previous_update != &updated {
                    return Err("Agents share a configuration file but disagree on the edit".into());
                }
            } else {
                files.insert(path, (definition.name.as_str(), source, updated));
            }
        }

        for (path, (name, source, _)) in &files {
            verify_discovery_source(path, name, source)?;
        }
        for (removed, (path, (name, source, updated))) in files.into_iter().enumerate() {
            let result = verify_discovery_source(&path, name, &source)
                .and_then(|()| storage::atomic_write(&path, &updated));
            if let Err(error) = result {
                return Err(format!(
                    "{name}: removal stopped after updating {removed} configuration files. {error}"
                ));
            }
        }
        Ok(())
    }

    fn adoption_source(&self, agent: &str, key: &str) -> Result<(PathBuf, Value), String> {
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
        Ok((path, value))
    }

    fn adopt_entry(
        &mut self,
        agent: &str,
        key: &str,
        path: PathBuf,
        value: Value,
        expected: Option<&Connection>,
    ) -> Result<(), String> {
        self.check_config_owner(agent, &path)?;
        let adapter = adapters::get(&self.definition(agent)?.adapter)?;
        let connection = adapter
            .decode(&value)
            .ok_or("This server uses an unsupported configuration")?;
        connection.validate()?;
        if expected.is_some_and(|expected| expected != &connection) {
            return Err("The connection changed after comparison. Rescan before importing.".into());
        }
        let enabled = native_enabled(&value);
        let id = if let Some(existing) = self
            .library
            .servers
            .iter_mut()
            .find(|server| server.key == key)
        {
            if existing.connection != connection {
                return Err("This key belongs to a different library server".into());
            }
            if self
                .applied
                .get(&existing.id)
                .and_then(|agents| agents.get(agent))
                .is_some()
            {
                return Err("This key is already recorded for this agent".into());
            }
            if enabled && !existing.enabled {
                existing.enabled = true;
                // Adopting an active entry must not reactivate other previously disabled agents.
                existing.agents.clear();
            }
            if enabled || !existing.enabled {
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
        self.local.agents.entry(agent.into()).or_default().enabled = true;
        Ok(())
    }

    fn reconcile(&mut self, write: bool) {
        self.issues.clear();
        for server in self.library.servers.clone() {
            self.reconcile_server(&server, write);
        }
    }

    fn reconcile_server(&mut self, server: &Server, write: bool) {
        let mut targets = server.agents.clone();
        if let Some(records) = self.applied.get(&server.id) {
            targets.extend(records.keys().cloned());
        }
        for agent in targets {
            if self.definition(&agent).is_err() {
                continue;
            }
            if let Err(message) = self.apply(server, &agent, write) {
                self.issues.push(Issue {
                    server: server.id.clone(),
                    agent,
                    message,
                });
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
        if wanted {
            self.check_config_owner(agent, &path)?;
        }
        let source = storage::read(&path)?;
        let content = source.as_deref().unwrap_or_default();
        let mut entries = adapter.read(content)?;
        let current = entries.get(&server.key).map(storage::fingerprint);
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
                Some(value) => activate_native(edit_imported_connection(
                    adapter,
                    value,
                    &server.connection,
                )?),
                None => adapter.encode(&server.connection)?,
            })
        } else {
            None
        };
        let expected = value.as_ref().map(storage::fingerprint);
        if !write {
            let already_disabled = !wanted
                && entries
                    .get(&server.key)
                    .is_some_and(|value| !native_enabled(value));
            return if current == expected || already_disabled {
                Ok(())
            } else {
                Err("Configuration changes are pending. Retry to apply them.".into())
            };
        }
        let updated = if current != expected {
            let updated = adapter.update(content, &server.key, value.clone())?;
            match value {
                Some(value) => {
                    entries.insert(server.key.clone(), value);
                }
                None => {
                    entries.remove(&server.key);
                }
            }
            if adapter.read(&updated)? != entries {
                return Err("Configuration edit did not preserve the intended MCP entries".into());
            }
            Some(updated)
        } else {
            None
        };
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
        if let Some(updated) = updated {
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

fn edit_imported_connection(
    adapter: &dyn Adapter,
    original: &Value,
    connection: &Connection,
) -> Result<Value, String> {
    let previous = adapter
        .decode(original)
        .ok_or("Imported connection is unsupported")?;
    if &previous == connection {
        return Ok(original.clone());
    }
    let mut value = original
        .as_object()
        .cloned()
        .ok_or("Expected an imported server object")?;
    let old = adapter.encode(&previous)?;
    let new = adapter.encode(connection)?;
    for key in old.as_object().ok_or("Expected a server object")?.keys() {
        value.remove(key);
    }
    let changes_destination = match (&previous, connection) {
        (Connection::Stdio { .. }, Connection::Stdio { .. }) => false,
        (Connection::Http { url: previous }, Connection::Http { url: next }) => {
            let origin = |url: &str| url::Url::parse(url).ok().map(|url| url.origin());
            origin(previous) != origin(next)
        }
        _ => true,
    };
    if changes_destination
        && value
            .keys()
            .any(|key| !matches!(key.as_str(), "enabled" | "disabled"))
    {
        return Err("The imported server has additional settings. Changing its transport or HTTP origin could make those settings unsafe or invalid.".into());
    }
    value.extend(new.as_object().cloned().ok_or("Expected a server object")?);
    let updated = Value::Object(value);
    if adapter.decode(&updated).as_ref() != Some(connection) {
        return Err("The adapter cannot safely apply this connection edit".into());
    }
    Ok(updated)
}

fn discovery_revision(path: &Path, hash: &str) -> String {
    storage::fingerprint(&serde_json::json!([path, hash]))
}

fn verify_discovery_source(path: &Path, name: &str, source: &str) -> Result<(), String> {
    if path.canonicalize().ok().as_deref() != Some(path)
        || storage::read(path)?.as_deref() != Some(source)
    {
        return Err(format!(
            "{name}: the configuration changed. Rescan before removing the entry."
        ));
    }
    Ok(())
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
