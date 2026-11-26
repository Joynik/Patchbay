# Patchbay

Patchbay is a macOS app for managing MCP server configurations across AI agents. It discovers
servers in local agent settings and lets you manage them from one library. Enable a server globally
or for individual agents. You can also stop managing a server and leave its agent settings intact.

Patchbay supports Codex, Claude Code, Claude Desktop, Pi, OpenCode, Antigravity, Gemini CLI, Oh My
Pi, Hermes Agent, and DeepSeek Harness. Transport support varies by agent.

## Install

Use Homebrew on Apple Silicon or Intel Macs.

```sh
brew install --cask joynik/tap/patchbay
```

To install manually, download the macOS ZIP for your Mac from [GitHub Releases][releases]. Extract
it and move `Patchbay.app` to Applications. The release builds are not notarized.

To upgrade a Homebrew installation, run `brew update` and `brew upgrade --cask joynik/tap/patchbay`.

## Build from source

Install Bun, Rust stable, and the Xcode Command Line Tools (`xcode-select --install`). From the
repository root, run:

```sh
bun install --frozen-lockfile
bun x --no-install tauri build
```

The build writes `Patchbay.app` to `src-tauri/target/release/bundle/macos/`.

[releases]: https://github.com/Joynik/Patchbay/releases
