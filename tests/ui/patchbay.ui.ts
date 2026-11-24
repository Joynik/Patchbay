import { expect } from "@playwright/test";

import { codex, fixtureServer, test } from "./fixture";

test("adds an HTTP server, edits its description and confirms removal", async ({
    page,
    desktop,
}) => {
    await desktop.open();
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.getByText("No servers in the library")).toBeVisible();

    const connection = { type: "http", url: "https://example.test/mcp" } as const;
    const remote = {
        ...fixtureServer,
        name: "remote",
        key: "remote",
        description: "Remote docs",
        connection,
    };
    desktop.reply(
        { type: "add", name: remote.name, description: remote.description, connection },
        { servers: [remote] },
    );
    await page.getByRole("button", { name: "Add server" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(remote.name);
    await dialog.getByRole("combobox", { name: "Transport" }).click();
    await page.getByRole("option", { name: "Streamable HTTP" }).click();
    await expect(dialog.getByRole("textbox", { name: "Command", exact: true })).toBeHidden();
    await dialog.getByLabel("Endpoint URL").fill(connection.url);
    await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill(remote.description);
    await dialog.getByRole("button", { name: "Save" }).click();

    const row = page.getByRole("row").filter({ hasText: "remote" });
    await expect(row).toContainText(remote.description);
    await row.getByRole("button", { name: "Edit description" }).click();
    const description = "Updated docs";
    desktop.reply(
        { type: "describe", server: remote.id, description },
        { servers: [{ ...remote, description }] },
    );
    await dialog.getByRole("textbox", { name: "Description", exact: true }).fill(description);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText(description);

    await row.getByRole("button", { name: "Remove server" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Remove server" }).click();
    desktop.reply({ type: "remove", server: remote.id }, { servers: [] });
    await dialog.getByRole("button", { name: "Remove server" }).click();
    await expect(row).toBeHidden();
    await expect(page.getByText("No servers in the library")).toBeVisible();
});

test("keeps the form open on a rejected add and sends stdio arguments separately", async ({
    page,
    desktop,
}) => {
    await desktop.open();
    await page.getByRole("button", { name: "Library" }).click();
    await page.getByRole("button", { name: "Add server" }).click();
    const dialog = page.getByRole("dialog");
    const args = ["--label", "two words"];
    const connection = { type: "stdio" as const, command: "/usr/bin/true", args };
    const action = { type: "add" as const, name: fixtureServer.name, description: "", connection };
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(fixtureServer.name);
    await dialog.getByRole("textbox", { name: "Command", exact: true }).fill(connection.command);
    await dialog.getByLabel("Arguments, one per line").fill(args.join("\n"));
    desktop.reply(action, new Error("This server name is already in the library"));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("This server name is already in the library")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Arguments, one per line")).toHaveValue(args.join("\n"));

    desktop.reply(action, { servers: [{ ...fixtureServer, connection }] });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("rowheader", { name: /fixture/ })).toBeVisible();
});

test("adopts a discovered entry and keeps unrelated entries outside the library", async ({
    page,
    desktop,
}) => {
    const unmanaged = { key: "other", supported: true };
    const adopted = { ...fixtureServer, agents: [codex.id] };
    const second = { ...codex, id: "other-agent", name: "Other Agent" };
    await desktop.open({
        agents: [
            {
                ...codex,
                enabled: false,
                discovered: [{ key: adopted.key, supported: true }, unmanaged],
            },
            { ...second, discovered: [{ key: unmanaged.key, supported: false }] },
        ],
    });
    await page.getByRole("button", { name: "Agents" }).click();
    await expect(page.getByRole("button", { name: /Take under management/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Library" }).click();
    const discovered = page.getByRole("region", { name: "Discovered servers" });
    const entry = discovered.getByRole("row").filter({ hasText: /^fixture/ });
    desktop.reply(
        { type: "adopt", agent: codex.id, key: adopted.key },
        {
            servers: [adopted],
            agents: [
                { ...codex, discovered: [unmanaged], applied: 1 },
                { ...second, discovered: [{ key: unmanaged.key, supported: false }] },
            ],
        },
    );
    await entry.getByRole("button", { name: /Take under management/ }).click();
    await page.getByRole("menuitem", { name: "Codex" }).click();
    await expect(entry).toBeHidden();
    const grouped = discovered.getByRole("row").filter({ hasText: /^other/ });
    await expect(grouped).toHaveCount(1);
    await expect(grouped).toContainText("Codex");
    await expect(grouped).toContainText("Other Agent");
    await expect(grouped).toContainText("Unsupported configuration");
    const managed = page.getByRole("region", { name: "Managed servers" });
    await expect(managed.getByRole("switch", { name: "Codex · fixture" })).toBeChecked();
    await expect(managed.getByRole("rowheader", { name: /other/ })).toHaveCount(0);
});

test("shows global and per-agent state and reports a failed apply until retry", async ({
    page,
    desktop,
}) => {
    await desktop.open({ servers: [fixtureServer] });
    await page.getByRole("button", { name: "Library" }).click();
    const global = page.getByRole("switch", { name: "Global · fixture" });
    const assignment = page.getByRole("switch", { name: "Codex · fixture" });
    const assigned = { ...fixtureServer, agents: [codex.id] };
    desktop.reply(
        { type: "assign", server: fixtureServer.id, agent: codex.id, enabled: true },
        {
            servers: [assigned],
            issues: [
                { agent: codex.id, server: fixtureServer.id, message: "Configuration conflict" },
            ],
        },
    );
    await assignment.click();
    await expect(assignment).toBeChecked();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Codex · fixture — Configuration conflict");
    desktop.reply({ type: "retry" }, { agents: [{ ...codex, applied: 1 }], issues: [] });
    await alert.getByRole("button", { name: "Retry applying" }).click();
    await expect(alert).toBeHidden();

    desktop.reply(
        { type: "global", server: fixtureServer.id, enabled: false },
        {
            servers: [{ ...assigned, enabled: false }],
            agents: [codex],
        },
    );
    await global.click();
    await expect(global).not.toBeChecked();
    await expect(assignment).toBeChecked();
    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByRole("definition").first()).toHaveText("1");
    await expect(page.getByRole("listitem").filter({ hasText: "Codex" })).toHaveText(/Codex\s*0/);
});

test("reveals hidden agents and updates a settings folder", async ({ page, desktop }) => {
    const hidden = { ...codex, enabled: false, hidden: true, folder: null };
    await desktop.open({ agents: [hidden] });
    await page.getByRole("button", { name: "Agents" }).click();
    const heading = page.getByRole("heading", { name: "Codex" });
    await expect(heading).toBeHidden();
    await page.getByRole("checkbox", { name: "Show hidden" }).check();
    await expect(heading).toBeVisible();
    await expect(page.getByRole("switch", { name: "Manage · Codex" })).toBeDisabled();
    await page.getByRole("button", { name: "Set folder" }).click();
    const dialog = page.getByRole("dialog");
    const folder = "/fixture/custom-codex";
    desktop.reply(
        { type: "folder", agent: codex.id, folder },
        { agents: [{ ...hidden, folder, override_folder: folder }] },
    );
    await dialog.getByLabel("Settings folder").fill(folder);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(folder)).toBeVisible();
    const manage = page.getByRole("switch", { name: "Manage · Codex" });
    await expect(manage).toBeEnabled();
    const updated = { ...hidden, folder, override_folder: folder };
    desktop.reply(
        { type: "manage", agent: codex.id, enabled: true },
        { agents: [{ ...updated, enabled: true }] },
    );
    await manage.click();
    await expect(manage).toBeChecked();
    desktop.reply(
        { type: "hide", agent: codex.id, hidden: false },
        { agents: [{ ...updated, enabled: true, hidden: false }] },
    );
    await page.getByRole("button", { name: "Codex · Actions" }).click();
    await page.getByRole("menuitem", { name: "Show agent" }).click();
    await expect(page.getByRole("checkbox", { name: "Show hidden" })).toBeHidden();
    await expect(heading).toBeVisible();
});

test("restores appearance and language from saved settings after reload", async ({
    page,
    desktop,
}) => {
    await desktop.open();
    await page.getByRole("button", { name: "Settings" }).click();
    desktop.reply({ type: "settings", theme: "light", locale: "en" }, { theme: "light" });
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    desktop.reply({ type: "text_size", size: "large" }, { text_size: "large" });
    await page.getByText("Large", { exact: true }).click();
    await expect(page.locator("html")).toHaveCSS("font-size", "16px");

    desktop.reply({ type: "settings", theme: "light", locale: "uk" }, { locale: "uk" });
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "Українська" }).click();
    await expect(page.getByRole("heading", { name: "Налаштування" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Огляд" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.locator("html")).toHaveCSS("font-size", "16px");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("validates pasted JSON and fills editable server fields", async ({ page, desktop }) => {
    await desktop.open();
    await page.getByRole("button", { name: "Library" }).click();
    await page.getByRole("button", { name: "Add server" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Import from JSON", { exact: true }).click();
    const source = dialog.getByRole("textbox", { name: "Import from JSON" });
    await source.fill('{"mcpServers":{"fixture":{"command":"fixture","env":{"TOKEN":"value"}}}}');
    await dialog.getByRole("button", { name: "Fill fields" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Name" })).toBeEmpty();

    await source.fill(
        '{"mcpServers":{"fixture":{"command":"fixture","args":["--label","two words"]}}}',
    );
    await dialog.getByRole("button", { name: "Fill fields" }).click();
    await expect(dialog.getByRole("alert")).toBeHidden();
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("fixture");
    await expect(dialog.getByRole("textbox", { name: "Command" })).toHaveValue("fixture");
    await expect(dialog.getByLabel("Arguments, one per line")).toHaveValue("--label\ntwo words");

    const connection = { type: "http" as const, url: "https://example.test/mcp" };
    await dialog.getByText("Import from JSON", { exact: true }).click();
    await source.fill('"fixture": {"type":"http","url":"https://example.test/mcp"}');
    await dialog.getByRole("button", { name: "Fill fields" }).click();
    await expect(dialog.getByLabel("Endpoint URL")).toHaveValue(connection.url);
    await dialog.getByLabel("Description").fill("Remote");
    desktop.reply(
        { type: "add", name: "fixture", description: "Remote", connection },
        { servers: [{ ...fixtureServer, description: "Remote", connection }] },
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: "fixture" })).toContainText("Remote");
});

test("reorders agent cards by dragging and keyboard and restores the order", async ({
    page,
    desktop,
}) => {
    const pi = { ...codex, id: "pi", name: "Pi", config_file: null };
    await desktop.open({ agents: [codex, pi] });
    const openAgents = () => page.getByRole("button", { name: "Agents", exact: true }).click();
    const cards = page.getByRole("heading", { level: 2 });
    await openAgents();
    await expect(cards).toHaveText(["Codex", "Pi"]);
    await expect(page.getByTitle("/fixture/.codex/config.toml")).toContainText("config.toml");
    const icon = page.getByRole("region", { name: "Codex" }).locator("img");
    await expect(icon).toBeVisible();
    await expect
        .poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);

    desktop.reply({ type: "agent_order", ids: ["pi", "codex"] }, { agents: [pi, codex] });
    await page
        .getByRole("button", { name: "Reorder agent · Codex" })
        .dragTo(page.getByRole("region", { name: "Pi" }));
    await expect(cards).toHaveText(["Pi", "Codex"]);

    desktop.reply({ type: "agent_order", ids: ["codex", "pi"] }, { agents: [codex, pi] });
    await page.getByRole("button", { name: "Reorder agent · Codex" }).press("ArrowUp");
    await expect(cards).toHaveText(["Codex", "Pi"]);

    await page.reload();
    await openAgents();
    await expect(cards).toHaveText(["Codex", "Pi"]);
});
