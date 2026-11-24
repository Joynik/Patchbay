# Patchbay

## Tests

Install the project dependencies with `bun install`. Then install Chromium once and run the tests.

```sh
bun x --no-install playwright install --only-shell chromium
mise run test
```

The browser tests start Vite and use fixture responses at the Tauri command boundary.
`mise run test` runs both the Rust and browser suites. `mise run verify` also checks lint,
formatting, and types.
