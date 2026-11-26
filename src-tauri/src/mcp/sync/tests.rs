use super::*;
use serde_json::json;

fn fixture() -> (tempfile::TempDir, PathBuf, Workspace) {
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join(".codex");
    fs::create_dir(&folder).unwrap();
    let mut workspace = Workspace::open(root.path().into(), root.path().join("patchbay")).unwrap();
    workspace
        .change(Action::Folder {
            agent: "codex".into(),
            folder: Some(folder.clone()),
        })
        .unwrap();
    (root, folder.join("config.toml"), workspace)
}

#[test]
fn adopts_codex_toggles_and_restores_after_reopening() {
    let (root, file, mut workspace) = fixture();
    let original = "# keep this\nmodel = 'example'\n\n[mcp_servers.existing]\ncommand = '/usr/bin/true'\nargs = []\n\n[mcp_servers.other]\nurl = 'https://example.test/mcp'\n";
    fs::write(&file, original).unwrap();

    let before = workspace.snapshot();
    assert_eq!(before.agents[0].discovered.len(), 2);
    assert_eq!(before.agents[0].applied, 0);

    let snapshot = workspace
        .change(Action::Adopt {
            agents: vec!["codex".into()],
            key: "existing".into(),
            expected: None,
        })
        .unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), original);
    assert_eq!(snapshot.agents[0].applied, 1);
    let id = snapshot.servers[0].id.clone();

    let snapshot = workspace
        .change(Action::Global {
            server: id.clone(),
            enabled: false,
        })
        .unwrap();
    assert!(snapshot.issues.is_empty());
    assert_eq!(snapshot.agents[0].applied, 0);
    let content = fs::read_to_string(&file).unwrap();
    assert!(content.contains("# keep this"));
    assert!(content.contains("[mcp_servers.other]"));
    assert!(!content.contains("[mcp_servers.existing]"));

    let mut reopened = Workspace::open(root.path().into(), root.path().join("patchbay")).unwrap();
    let snapshot = reopened
        .change(Action::Global {
            server: id.clone(),
            enabled: true,
        })
        .unwrap();
    assert!(snapshot.issues.is_empty());
    assert_eq!(snapshot.agents[0].applied, 1);
    let content = fs::read_to_string(&file).unwrap();
    assert!(content.contains("[mcp_servers.existing]"));

    let snapshot = reopened.change(Action::Remove { server: id }).unwrap();
    assert!(snapshot.servers.is_empty());
    assert_eq!(snapshot.agents[0].discovered[0].key, "other");
}

#[test]
fn preserves_a_manual_edit_and_reports_conflict() {
    let (_root, file, mut workspace) = fixture();
    fs::write(&file, "[mcp_servers.example]\ncommand = 'original'\n").unwrap();
    let snapshot = workspace
        .change(Action::Adopt {
            agents: vec!["codex".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();
    let id = snapshot.servers[0].id.clone();
    let edited = "[mcp_servers.example]\ncommand = 'changed'\n";
    fs::write(&file, edited).unwrap();

    let result = workspace.change(Action::Remove { server: id }).unwrap();
    assert_eq!(result.issues.len(), 1);
    assert_eq!(result.servers.len(), 1);
    assert_eq!(fs::read_to_string(&file).unwrap(), edited);
}

#[test]
fn all_adapters_round_trip_supported_connections_and_keep_other_entries() {
    for definition in agents::definitions().unwrap() {
        let adapter = adapters::get(&definition.adapter).unwrap();
        let stdio = Connection::Stdio {
            command: "/usr/bin/true".into(),
            args: vec!["two words".into()],
        };
        let encoded = adapter.encode(&stdio).unwrap();
        let initial = adapter
            .update("", "unmanaged", Some(encoded.clone()))
            .unwrap();
        let changed = adapter.update(&initial, "managed", Some(encoded)).unwrap();
        let entries = adapter.read(&changed).unwrap();
        assert_eq!(adapter.decode(&entries["managed"]), Some(stdio));
        let updated = adapter.update(&changed, "managed", None).unwrap();
        assert_eq!(
            adapter.read(&updated).unwrap(),
            adapter.read(&initial).unwrap()
        );

        if adapter.supports_http() {
            let http = Connection::Http {
                url: "https://example.test/mcp".into(),
            };
            let source = adapter
                .update(&updated, "http", Some(adapter.encode(&http).unwrap()))
                .unwrap();
            let entries = adapter.read(&source).unwrap();
            assert_eq!(adapter.decode(&entries["http"]), Some(http));
        }
    }
}

#[test]
fn preserves_opencode_jsonc_comments() {
    let adapter = adapters::get("opencode").unwrap();
    let source = "{\n  // keep provider comment\n  \"model\": \"example\",\n  \"mcp\": {\n    // keep this entry\n    \"other\": {\"type\": \"local\", \"command\": [\"true\"]},\n  },\n}\n";
    let value = json!({"type": "remote", "url": "https://example.test/mcp"});
    let updated = adapter
        .update(source, "managed", Some(value.clone()))
        .unwrap();
    assert_eq!(adapter.read(&updated).unwrap()["managed"], value);
    let updated = adapter.update(&updated, "managed", None).unwrap();
    assert_eq!(adapter.read(&updated), adapter.read(source));
    assert!(updated.contains("// keep provider comment"));
    assert!(updated.contains("// keep this entry"));
}

#[test]
fn persists_desired_state_and_retries_interrupted_writes() {
    let (root, file, mut workspace) = fixture();
    workspace
        .change(Action::Add {
            name: "managed".into(),
            description: "Fixture".into(),
            connection: Connection::Stdio {
                command: "/usr/bin/true".into(),
                args: Vec::new(),
            },
        })
        .unwrap();
    let id = workspace.snapshot().servers[0].id.clone();
    workspace
        .change(Action::Assign {
            server: id,
            agent: "codex".into(),
            enabled: true,
        })
        .unwrap();
    assert!(!file.exists());
    fs::write(&file, "not valid toml").unwrap();
    let state = workspace
        .change(Action::Manage {
            agent: "codex".into(),
            enabled: true,
        })
        .unwrap();
    assert_eq!(state.issues.len(), 1);
    assert_eq!(fs::read_to_string(&file).unwrap(), "not valid toml");

    fs::write(&file, "# fixed by user\n").unwrap();
    let mut reopened = Workspace::open(root.path().into(), root.path().join("patchbay")).unwrap();
    assert_eq!(reopened.snapshot().issues.len(), 1);
    assert_eq!(fs::read_to_string(&file).unwrap(), "# fixed by user\n");
    let state = reopened.change(Action::Retry).unwrap();
    assert!(state.issues.is_empty());
    assert_eq!(state.agents[0].applied, 1);
}

#[test]
fn claude_code_paths_distinguish_the_default_and_custom_folders() {
    let root = tempfile::tempdir().unwrap();
    let default = root.path().join(".claude");
    fs::create_dir(&default).unwrap();
    let default = default.canonicalize().unwrap();
    let home = root.path().canonicalize().unwrap();
    let adapter = adapters::get("claude_code").unwrap();
    assert_eq!(adapter.path(&default, &home), home.join(".claude.json"));
    let custom = home.join("custom");
    assert_eq!(adapter.path(&custom, &home), custom.join(".claude.json"));
}

#[test]
fn opencode_current_and_legacy_formats_round_trip() {
    let adapter = adapters::get("opencode").unwrap();
    let server = json!({"type": "remote", "url": "https://example.test/mcp"});
    let current = adapter.update("", "example", Some(server.clone())).unwrap();
    let from_current: Value = serde_json::from_str(&current).unwrap();
    assert_eq!(from_current["mcp"]["servers"]["example"], server);

    let legacy = r#"{"mcp":{"example":{"type":"remote","url":"https://example.test/mcp"}}}"#;
    let removed = adapter.update(legacy, "example", None).unwrap();
    let restored = adapter
        .update(&removed, "example", Some(server.clone()))
        .unwrap();
    let from_legacy: Value = serde_json::from_str(&restored).unwrap();
    assert_eq!(from_legacy["mcp"]["example"], server);
}

#[test]
fn restores_text_size_and_agent_order_from_local_settings() {
    let (root, config_file, mut workspace) = fixture();
    let data = root.path().join("patchbay");
    fs::write(
        data.join("local.json"),
        r#"{"theme":"light","locale":"en","agents":{}}"#,
    )
    .unwrap();
    workspace.reload().unwrap();

    let snapshot = workspace.snapshot();
    assert_eq!(snapshot.text_size, super::super::TextSize::Small);
    assert_eq!(
        serde_json::from_str::<super::super::TextSize>(r#""extra_large""#).unwrap(),
        super::super::TextSize::Large
    );
    let codex = snapshot
        .agents
        .iter()
        .find(|agent| agent.id == "codex")
        .unwrap();
    let resolved = config_file
        .parent()
        .unwrap()
        .canonicalize()
        .unwrap()
        .join("config.toml");
    assert_eq!(codex.config_file.as_ref(), Some(&resolved));

    let ids: Vec<_> = snapshot
        .agents
        .iter()
        .rev()
        .map(|agent| agent.id.clone())
        .collect();
    assert!(
        workspace
            .change(Action::AgentOrder {
                ids: vec![ids[0].clone(); ids.len()]
            })
            .is_err()
    );
    workspace
        .change(Action::AgentOrder { ids: ids.clone() })
        .unwrap();
    workspace
        .change(Action::TextSize {
            size: super::super::TextSize::Large,
        })
        .unwrap();

    let snapshot = Workspace::open(root.path().into(), data)
        .unwrap()
        .snapshot();
    assert_eq!(snapshot.text_size, super::super::TextSize::Large);
    assert_eq!(snapshot.theme, "light");
    assert_eq!(
        snapshot
            .agents
            .into_iter()
            .map(|agent| agent.id)
            .collect::<Vec<_>>(),
        ids
    );
    assert!(!config_file.exists());
}

#[test]
fn new_adapters_change_only_the_managed_entry() {
    let cases = [
        (
            "gemini",
            "settings.json",
            "{\n  \"theme\": \"dark\",\n  \"mcpServers\": { \"foreign\": { \"command\": \"other\" } }\n}\n",
            "\"theme\": \"dark\"",
        ),
        (
            "oh_my_pi",
            "mcp.json",
            "{\n  \"unrelated\": true,\n  \"mcpServers\": { \"foreign\": { \"command\": \"other\" } }\n}\n",
            "\"unrelated\": true",
        ),
        (
            "hermes",
            "config.yaml",
            "# leave this alone\nmodel: example\nmcp_servers:\n  foreign:\n    command: other\n",
            "# leave this alone\nmodel: example",
        ),
        (
            "deepseek_harness",
            "cordis.patch.yml",
            "# leave this alone\n- id: mcp\n  config:\n    servers:\n      foreign:\n        transport: stdio\n        command: other\n",
            "# leave this alone\n- id: mcp",
        ),
    ];

    for (agent, config_file, original, marker) in cases {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("agent");
        fs::create_dir(&folder).unwrap();
        let path = folder.join(config_file);
        fs::write(&path, original).unwrap();
        let mut workspace = Workspace::open(root.path().into(), root.path().join("data")).unwrap();
        workspace
            .change(Action::Folder {
                agent: agent.into(),
                folder: Some(folder),
            })
            .unwrap();
        workspace
            .change(Action::Manage {
                agent: agent.into(),
                enabled: true,
            })
            .unwrap();
        let snapshot = workspace
            .change(Action::Add {
                name: "patchbay-test".into(),
                description: String::new(),
                connection: Connection::Http {
                    url: "https://example.test/mcp".into(),
                },
            })
            .unwrap();
        let id = snapshot.servers[0].id.clone();
        let snapshot = workspace
            .change(Action::Assign {
                server: id.clone(),
                agent: agent.into(),
                enabled: true,
            })
            .unwrap();
        assert!(
            snapshot.issues.is_empty(),
            "{agent}: {:?}",
            snapshot
                .issues
                .iter()
                .map(|issue| &issue.message)
                .collect::<Vec<_>>()
        );
        let added = fs::read_to_string(&path).unwrap();
        assert!(added.contains(marker), "{agent}: {added}");
        assert!(added.contains("patchbay-test"), "{agent}: {added}");
        let adapter = adapters::get(agent).unwrap();
        let before = adapter.read(original).unwrap();
        assert_eq!(
            adapter.read(&added).unwrap().get("foreign"),
            before.get("foreign")
        );

        let snapshot = workspace.change(Action::Remove { server: id }).unwrap();
        assert!(snapshot.issues.is_empty(), "{agent}");
        let removed = fs::read_to_string(&path).unwrap();
        assert!(removed.contains(marker), "{agent}: {removed}");
        assert_eq!(adapter.read(&removed).unwrap(), before, "{agent}");
        if agent == "deepseek_harness" {
            assert_eq!(removed, original);
        }

        let conflicting = workspace
            .change(Action::Add {
                name: "foreign".into(),
                description: String::new(),
                connection: Connection::Stdio {
                    command: "new".into(),
                    args: vec![],
                },
            })
            .unwrap();
        let snapshot = workspace
            .change(Action::Assign {
                server: conflicting.servers[0].id.clone(),
                agent: agent.into(),
                enabled: true,
            })
            .unwrap();
        assert_eq!(snapshot.issues.len(), 1, "{agent}");
        assert_eq!(fs::read_to_string(&path).unwrap(), removed, "{agent}");
    }
}

#[test]
fn new_adapters_refuse_ambiguous_configuration() {
    for (agent, source) in [
        (
            "gemini",
            r#"{"mcpServers":{"foreign":{"command":"one"},"foreign":{"command":"two"}}}"#,
        ),
        (
            "hermes",
            "mcp_servers:\n  foreign: {command: one}\n  foreign: {command: two}\n",
        ),
        ("hermes", "mcp_servers: ["),
        ("deepseek_harness", "config: {servers: {}}"),
    ] {
        let adapter = adapters::get(agent).unwrap();
        assert!(adapter.read(source).is_err(), "{agent}");
        assert!(adapter.update(source, "foreign", None).is_err(), "{agent}");
    }
}

#[test]
fn refuses_to_manage_a_shared_pi_file_twice() {
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join(".pi/agent");
    fs::create_dir_all(&folder).unwrap();
    let path = folder.join("mcp.json");
    let original = r#"{"mcpServers":{"foreign":{"command":"keep"}}}"#;
    fs::write(&path, original).unwrap();

    let mut workspace = Workspace::open(root.path().into(), root.path().join("data")).unwrap();
    workspace
        .change(Action::Folder {
            agent: "pi".into(),
            folder: Some(folder.clone()),
        })
        .unwrap();
    workspace
        .change(Action::Folder {
            agent: "oh_my_pi".into(),
            folder: Some(folder),
        })
        .unwrap();
    workspace
        .change(Action::Manage {
            agent: "pi".into(),
            enabled: true,
        })
        .unwrap();
    assert!(
        workspace
            .change(Action::Manage {
                agent: "oh_my_pi".into(),
                enabled: true
            })
            .err()
            .unwrap()
            .contains("shared with Pi")
    );
    assert!(
        workspace
            .change(Action::Adopt {
                agents: vec!["oh_my_pi".into()],
                key: "foreign".into(),
                expected: None,
            })
            .is_err()
    );
    assert_eq!(fs::read_to_string(path).unwrap(), original);
}

#[test]
fn ignores_retired_agent_assignments_without_changing_pi_configuration() {
    let (root, file, mut workspace) = fixture();
    fs::write(file, "[mcp_servers.example]\ncommand = 'keep'\n").unwrap();
    workspace
        .change(Action::Adopt {
            agents: vec!["codex".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();

    let pi_folder = root.path().join(".pi/agent");
    fs::create_dir_all(&pi_folder).unwrap();
    let pi_config = pi_folder.join("mcp.json");
    let original = r#"{"mcpServers":{"example":{"command":"keep"}}}"#;
    fs::write(&pi_config, original).unwrap();

    let server = &mut workspace.library.servers[0];
    server.agents.insert("thinkrail".into());
    let id = server.id.clone();
    storage::save(&workspace.data.join("library.json"), &workspace.library).unwrap();

    let snapshot = workspace.change(Action::Remove { server: id }).unwrap();
    assert!(snapshot.servers.is_empty());
    assert!(snapshot.issues.is_empty());
    assert!(snapshot.agents.iter().all(|agent| agent.id != "thinkrail"));
    assert_eq!(fs::read_to_string(pi_config).unwrap(), original);
}

#[test]
fn adopts_all_matching_sources_without_rewriting_agent_files() {
    let (root, codex_file, mut workspace) = fixture();
    let gemini_folder = root.path().join(".gemini");
    fs::create_dir(&gemini_folder).unwrap();
    let gemini_file = gemini_folder.join("settings.json");
    let original_codex = "[mcp_servers.example]\ncommand = 'keep'\n";
    let original_gemini = r#"{"mcpServers":{"example":{"command":"keep"}}}"#;
    let different_gemini = r#"{"mcpServers":{"example":{"command":"other"}}}"#;
    fs::write(&codex_file, original_codex).unwrap();
    fs::write(&gemini_file, different_gemini).unwrap();
    workspace
        .change(Action::Folder {
            agent: "gemini".into(),
            folder: Some(gemini_folder),
        })
        .unwrap();

    let adopt = || Action::Adopt {
        agents: vec!["codex".into(), "gemini".into()],
        key: "example".into(),
        expected: None,
    };
    assert!(workspace.change(adopt()).is_err());
    assert!(workspace.snapshot().servers.is_empty());
    assert!(workspace.applied.is_empty());
    assert_eq!(fs::read_to_string(&codex_file).unwrap(), original_codex);
    assert_eq!(fs::read_to_string(&gemini_file).unwrap(), different_gemini);

    fs::write(&gemini_file, original_gemini).unwrap();
    let stale = workspace.change(Action::Adopt {
        agents: vec!["codex".into(), "gemini".into()],
        key: "example".into(),
        expected: Some(Connection::Stdio {
            command: "outdated".into(),
            args: vec![],
        }),
    });
    assert!(matches!(stale, Err(error) if error.contains("changed after comparison")));
    assert!(workspace.snapshot().servers.is_empty());

    let snapshot = workspace.change(adopt()).unwrap();
    assert_eq!(snapshot.servers.len(), 1);
    let server = &snapshot.servers[0];
    assert_eq!(
        server.agents,
        BTreeSet::from(["codex".into(), "gemini".into()])
    );
    assert_eq!(fs::read_to_string(&codex_file).unwrap(), original_codex);
    assert_eq!(fs::read_to_string(&gemini_file).unwrap(), original_gemini);

    workspace
        .change(Action::Global {
            server: server.id.clone(),
            enabled: false,
        })
        .unwrap();
    assert!(!fs::read_to_string(&codex_file).unwrap().contains("example"));
    assert!(
        !fs::read_to_string(&gemini_file)
            .unwrap()
            .contains("example")
    );
}

#[test]
fn adopts_active_source_into_disabled_server_without_enabling_other_agents() {
    let (root, codex_file, mut workspace) = fixture();
    let gemini_folder = root.path().join(".gemini");
    fs::create_dir(&gemini_folder).unwrap();
    let gemini_file = gemini_folder.join("settings.json");
    let disabled_codex = "[mcp_servers.example]\ncommand = 'keep'\nenabled = false\n";
    let enabled_gemini = r#"{"mcpServers":{"example":{"command":"keep"}}}"#;
    fs::write(&codex_file, disabled_codex).unwrap();
    fs::write(&gemini_file, enabled_gemini).unwrap();

    let snapshot = workspace
        .change(Action::Adopt {
            agents: vec!["codex".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();
    assert!(!snapshot.servers[0].enabled);
    assert!(workspace.refresh().unwrap().issues.is_empty());

    let snapshot = workspace
        .change(Action::Adopt {
            agents: vec!["gemini".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();
    assert!(snapshot.servers[0].enabled);
    assert_eq!(
        snapshot.servers[0].agents,
        BTreeSet::from(["gemini".into()])
    );
    assert!(workspace.refresh().unwrap().issues.is_empty());
    assert_eq!(fs::read_to_string(&codex_file).unwrap(), disabled_codex);
    assert_eq!(fs::read_to_string(&gemini_file).unwrap(), enabled_gemini);
}

#[test]
fn edits_an_adopted_connection_and_preserves_other_entries_and_native_options() {
    let (_root, file, mut workspace) = fixture();
    fs::write(
        &file,
        "# keep this\nmodel = 'example'\n\n[mcp_servers.example]\ncommand = 'old'\nenv = { MODE = 'keep' }\n\n[mcp_servers.other]\ncommand = 'untouched'\n",
    )
    .unwrap();
    let snapshot = workspace
        .change(Action::Adopt {
            agents: vec!["codex".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();
    let id = snapshot.servers[0].id.clone();
    let snapshot = workspace
        .change(Action::Edit {
            server: id.clone(),
            name: "new-display-name".into(),
            description: "Updated".into(),
            connection: Connection::Stdio {
                command: "new".into(),
                args: vec!["--flag".into()],
            },
        })
        .unwrap();
    assert!(snapshot.issues.is_empty());
    assert_eq!(snapshot.servers[0].name, "new-display-name");
    assert_eq!(snapshot.servers[0].key, "example");
    let source = fs::read_to_string(&file).unwrap();
    assert!(source.contains("# keep this"));
    assert!(source.contains("command = 'untouched'"));
    let adapter = adapters::get("codex").unwrap();
    let entries = adapter.read(&source).unwrap();
    assert_eq!(entries["example"]["command"], "new");
    assert_eq!(entries["example"]["args"], json!(["--flag"]));
    assert_eq!(entries["example"]["env"]["MODE"], "keep");

    assert!(
        workspace
            .change(Action::Edit {
                server: id,
                name: "new-display-name".into(),
                description: "Updated".into(),
                connection: Connection::Http {
                    url: "https://example.test/mcp".into()
                },
            })
            .is_err()
    );
    assert_eq!(fs::read_to_string(file).unwrap(), source);
    assert!(workspace.refresh().unwrap().issues.is_empty());
}

#[test]
fn removes_confirmed_discoveries_without_changing_managed_or_neighbor_entries() {
    let (root, codex_file, mut workspace) = fixture();
    let gemini_folder = root.path().join(".gemini");
    let pi_folder = root.path().join(".pi/agent");
    fs::create_dir(&gemini_folder).unwrap();
    fs::create_dir_all(&pi_folder).unwrap();
    let gemini_file = gemini_folder.join("settings.json");
    let pi_file = pi_folder.join("mcp.json");
    let codex_source = "# keep\nmodel = 'keep'\n\n[mcp_servers.example]\ncommand = 'codex-copy'\n\n[mcp_servers.other]\ncommand = 'keep'\n";
    let gemini_source = r#"{"theme":"keep","mcpServers":{"example":{"command":"gemini-copy"},"other":{"command":"keep"}}}"#;
    let pi_source = r#"{"mcpServers":{"example":{"command":"managed-copy"}}}"#;
    fs::write(&codex_file, codex_source).unwrap();
    fs::write(&gemini_file, gemini_source).unwrap();
    fs::write(&pi_file, pi_source).unwrap();
    workspace
        .change(Action::Adopt {
            agents: vec!["pi".into()],
            key: "example".into(),
            expected: None,
        })
        .unwrap();

    let remove = |snapshot: &Snapshot| Action::RemoveDiscovered {
        key: "example".into(),
        targets: ["codex", "gemini"]
            .into_iter()
            .map(|id| {
                let agent = snapshot.agents.iter().find(|agent| agent.id == id).unwrap();
                let entry = agent
                    .discovered
                    .iter()
                    .find(|entry| entry.key == "example")
                    .unwrap();
                DiscoveredTarget {
                    agent: id.into(),
                    revision: entry.revision.clone(),
                }
            })
            .collect(),
    };
    let confirmed = workspace.snapshot();
    let changed = gemini_source.replace("gemini-copy", "changed-copy");
    fs::write(&gemini_file, &changed).unwrap();
    assert!(workspace.change(remove(&confirmed)).is_err());
    assert_eq!(fs::read_to_string(&codex_file).unwrap(), codex_source);
    assert_eq!(fs::read_to_string(&gemini_file).unwrap(), changed);

    let refreshed = workspace.refresh().unwrap();
    let snapshot = workspace.change(remove(&refreshed)).unwrap();
    assert_eq!(snapshot.servers.len(), 1);
    assert_eq!(fs::read_to_string(&pi_file).unwrap(), pi_source);
    let codex_result = fs::read_to_string(codex_file).unwrap();
    let gemini_result = fs::read_to_string(gemini_file).unwrap();
    assert!(!codex_result.contains("example"));
    assert!(codex_result.contains("# keep"));
    assert!(codex_result.contains("[mcp_servers.other]"));
    assert!(!gemini_result.contains("example"));
    assert!(gemini_result.contains("\"theme\":\"keep\""));
    assert!(gemini_result.contains("\"other\""));
}

#[test]
fn releases_a_managed_server_for_rediscovery_without_writing_agent_files() {
    let (root, file, mut workspace) = fixture();
    let original = "# keep\nmodel = 'example'\n\n[mcp_servers.example]\ncommand = 'keep'\n";
    fs::write(&file, original).unwrap();
    let adopt = || Action::Adopt {
        agents: vec!["codex".into()],
        key: "example".into(),
        expected: None,
    };
    let managed = workspace.change(adopt()).unwrap();
    assert!(managed.agents[0].discovered.is_empty());

    let server = managed.servers[0].id.clone();
    let released = workspace
        .change(Action::Release {
            server: server.clone(),
        })
        .unwrap();
    assert!(released.servers.is_empty());
    assert!(!workspace.applied.contains_key(&server));
    assert_eq!(released.agents[0].discovered[0].key, "example");
    assert!(released.agents[0].enabled);
    assert_eq!(fs::read_to_string(&file).unwrap(), original);

    let mut reopened = Workspace::open(root.path().into(), root.path().join("patchbay")).unwrap();
    assert!(reopened.snapshot().servers.is_empty());
    assert_eq!(reopened.change(adopt()).unwrap().servers.len(), 1);
    assert_eq!(fs::read_to_string(file).unwrap(), original);
}
