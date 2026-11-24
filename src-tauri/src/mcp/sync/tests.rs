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
            agent: "codex".into(),
            key: "existing".into(),
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
            agent: "codex".into(),
            key: "example".into(),
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
    assert_eq!(snapshot.text_size, super::super::TextSize::Default);
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
