# Changelog

## Unreleased

### Added

- Stop managing a library server while leaving its agent configurations intact.
- Remove discovered MCP entries across agents after confirmation.
- Compare conflicting discovered MCP connections and choose which one to manage.
- Add MCP support for Gemini CLI, Oh My Pi, Hermes Agent, and DeepSeek Harness.

### Changed

- Edit the name, description, and connection of managed MCP servers.
- Sort managed servers by name and show assignment controls for enabled agents.
- Adopt a discovered MCP server and its existing agent connections in one action.
- Show applied server counts only for agents enabled in Settings.
- Move agent management below the main settings and center the selected preference options.
- Refine light-theme surfaces and Settings controls, with a brighter shared green accent.
- Use compact icon buttons and show agent icons without visible labels in the discovered-server
  list.
- Start with the small text preset and offer three sizes.
- Show agents in three columns and use their saved order in Library.
- Simplify agent cards and support separate icon files for each theme.

### Fixed

- Validate MCP server names, executable commands, and one-argument-per-line input.
- Refuse ambiguous configurations and verify that edits preserve other MCP entries.
- Lift agent cards during dragging and mark where they will be inserted.

## 0.2.0 — 2026-11-24

### Added

- Fill the Add Server form from a JSON snippet.
- Choose a text size and reorder agent cards. Patchbay remembers both preferences.

### Changed

- Display branded agent icons in Agents, Library, and Dashboard.
- Manage discovered MCP servers from Library, with entries grouped by server key.
- Use compact library rows, agent cards with configuration file names, and a full-width Settings
  panel.

## 0.1.0 — 2026-11-24

### Added

- Added a macOS desktop interface for a shared MCP library and per-agent assignments.
- Added global MCP configuration for Codex, Claude Code, Claude Desktop, Pi, Antigravity, and
  OpenCode.
- Added discovery of agent configuration folders and adoption of existing MCP entries.
- Added dashboard counts, light and dark themes, and seven interface languages.

### Changed

- Matched the macOS Dock icon to the Patchbay symbol shown in the app window.
