import { expect } from "@playwright/test";

import { codex, fixtureServer, test } from "./fixture";

test("adds an HTTP server, edits all its fields and confirms removal", async ({
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
    await row.getByRole("button", { name: "Edit server" }).click();
    const name = dialog.getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toHaveValue(remote.name);
    await expect(dialog.getByLabel("Endpoint URL")).toHaveValue(connection.url);
    const edited = {
        ...remote,
        name: "remote-updated",
        description: "Updated docs",
        connection: { type: "stdio" as const, command: "runner", args: ["--flag"] },
    };
    desktop.reply(
        {
            type: "edit",
            server: remote.id,
            name: edited.name,
            description: edited.description,
            connection: edited.connection,
        },
        { servers: [edited] },
    );
    await name.fill("invalid name!");
    await dialog.getByRole("button", { name: "Save" }).click();
    expect(await name.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(
        true,
    );
    await name.fill(edited.name);
    await dialog.getByRole("combobox", { name: "Transport" }).click();
    await page.getByRole("option", { name: "stdio" }).click();
    await dialog.getByLabel("Command", { exact: true }).fill(edited.connection.command);
    await dialog.getByLabel("Arguments, one per line").fill("--flag");
    await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill(edited.description);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText(edited.name);
    await expect(row).toContainText(edited.description);

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
    const commandInput = dialog.getByRole("textbox", { name: "Command", exact: true });
    const argsInput = dialog.getByLabel("Arguments, one per line");
    const save = dialog.getByRole("button", { name: "Save" });
    await commandInput.fill("npx -y package");
    await save.click();
    expect(
        await commandInput.evaluate((input: HTMLInputElement) => input.validationMessage),
    ).toMatch(/executable name or path/);
    await commandInput.fill(connection.command);
    await argsInput.fill("--label\n   \ntwo words");
    await save.click();
    expect(
        await argsInput.evaluate((input: HTMLTextAreaElement) => input.validationMessage),
    ).toMatch(/one non-blank argument per line/);
    await argsInput.fill(args.join("\n"));
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
    const second = { ...codex, id: "other-agent", name: "Other Agent" };
    const adopted = { ...fixtureServer, agents: [codex.id, second.id] };
    await desktop.open({
        agents: [
            {
                ...codex,
                enabled: false,
                discovered: [{ key: adopted.key, supported: true }, unmanaged],
            },
            {
                ...second,
                discovered: [
                    { key: adopted.key, supported: true },
                    { key: unmanaged.key, supported: false },
                ],
            },
        ],
    });
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("button", { name: "Manage · fixture", exact: true })).toHaveCount(
        0,
    );
    await page.getByRole("button", { name: "Library" }).click();
    const discovered = page.getByRole("region", { name: "Discovered servers" });
    const entry = discovered.getByRole("row").filter({ hasText: /^fixture/ });
    desktop.reply(
        { type: "adopt", agents: [codex.id, second.id], key: adopted.key },
        {
            servers: [adopted],
            agents: [
                { ...codex, discovered: [unmanaged], applied: 1 },
                { ...second, discovered: [{ key: unmanaged.key, supported: false }] },
            ],
        },
    );
    const adopt = entry.getByRole("button", { name: "Manage · fixture", exact: true });
    await expect(adopt).toHaveAttribute("title", "Manage");
    await expect(adopt).toHaveClass(/\bicon-button\b/);
    await adopt.click();
    await expect(entry).toBeHidden();
    await expect(page.getByRole("menu")).toHaveCount(0);
    const grouped = discovered.getByRole("row").filter({ hasText: /^other/ });
    await expect(grouped).toHaveCount(1);
    await expect(grouped).toContainText("Codex");
    await expect(grouped.getByTitle("Codex", { exact: true })).toBeVisible();
    await expect(grouped.getByText("Codex", { exact: true })).toHaveClass("sr-only");
    await expect(grouped.getByTitle("Other Agent · Unsupported configuration")).toBeVisible();
    await expect(grouped).toContainText("Unsupported configuration");
    const managed = page.getByRole("region", { name: "Managed servers" });
    await expect(managed.getByRole("switch", { name: "Codex · fixture" })).toBeChecked();
    await expect(managed.getByRole("switch", { name: "Other Agent · fixture" })).toBeChecked();
    await expect(managed.getByRole("rowheader", { name: /other/ })).toHaveCount(0);

    await managed.getByRole("button", { name: "Stop managing" }).click();
    const release = page.getByRole("dialog", { name: "Stop managing" });
    desktop.reply(
        { type: "release", server: adopted.id },
        {
            servers: [],
            agents: [
                { ...codex, discovered: [{ key: adopted.key, supported: true }, unmanaged] },
                { ...second, discovered: [{ key: adopted.key, supported: true }] },
            ],
        },
    );
    await release.getByRole("button", { name: "Stop managing" }).click();
    await expect(release).toBeHidden();
    await expect(managed.getByRole("rowheader", { name: adopted.key })).toHaveCount(0);
    await expect(entry.getByTitle("Codex")).toBeVisible();
    await expect(entry.getByTitle("Other Agent")).toBeVisible();
});

test("compares conflicting discoveries and imports the chosen connection", async ({
    page,
    desktop,
}) => {
    const key = fixtureServer.key;
    const codexConnection = fixtureServer.connection;
    const piConnection = { type: "http" as const, url: "https://example.test/pi" };
    const codexWithServer = {
        ...codex,
        discovered: [{ key, supported: true, connection: codexConnection }],
    };
    const pi = {
        ...codex,
        id: "pi",
        name: "Pi",
        discovered: [{ key, supported: true, connection: piConnection }],
    };
    await desktop.open({ agents: [codexWithServer, pi] });
    await page.getByRole("button", { name: "Library" }).click();
    const discovered = page.getByRole("region", { name: "Discovered servers" });
    const manage = discovered.getByRole("button", { name: `Manage · ${key}` });
    const review = page.getByRole("dialog", { name: `Compare connections · ${key}` });
    await manage.click();
    await expect(review).toContainText("/usr/bin/true");
    await expect(review).toContainText(piConnection.url);
    await review.getByRole("radio", { name: "Pi" }).check();
    desktop.reply(
        { type: "adopt", key, agents: ["pi"], expected: piConnection },
        {
            servers: [{ ...fixtureServer, connection: piConnection, agents: ["pi"] }],
            agents: [codexWithServer, { ...pi, discovered: [] }],
        },
    );
    await review.getByRole("button", { name: "Manage", exact: true }).click();
    await expect(review).toBeHidden();
    await expect(page.getByRole("switch", { name: `Pi · ${key}` })).toBeChecked();
    await expect(discovered.getByTitle("Codex")).toBeVisible();

    await manage.click();
    await expect(review.getByRole("radio", { name: "Codex" })).toBeDisabled();
    await expect(review.getByRole("button", { name: "Manage", exact: true })).toBeDisabled();
    await review.getByRole("button", { name: "Edit server" }).click();
    await expect(
        page.getByRole("dialog", { name: "Edit server" }).getByLabel("Endpoint URL"),
    ).toHaveValue(piConnection.url);
});

test("confirms removal of discovered duplicates without removing the managed server", async ({
    page,
    desktop,
}) => {
    const key = fixtureServer.key;
    const pi = {
        ...codex,
        id: "pi",
        name: "Pi",
        discovered: [{ key, supported: true, revision: "pi-revision" }],
    };
    const gemini = {
        ...codex,
        id: "gemini",
        name: "Gemini",
        discovered: [{ key, supported: true, revision: "gemini-revision" }],
    };
    const managed = { ...fixtureServer, agents: [codex.id] };
    await desktop.open({ agents: [codex, pi, gemini], servers: [managed] });
    await page.getByRole("button", { name: "Library" }).click();
    const discovered = page.getByRole("region", { name: "Discovered servers" });
    const remove = discovered.getByRole("button", { name: `Remove server · ${key}` });
    const dialog = page.getByRole("dialog");
    await remove.click();
    await expect(dialog.getByRole("listitem")).toHaveText(["Pi", "Gemini"]);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(remove).toBeVisible();
    await remove.click();
    desktop.reply(
        {
            type: "remove_discovered",
            key,
            targets: [
                { agent: "pi", revision: "pi-revision" },
                { agent: "gemini", revision: "gemini-revision" },
            ],
        },
        { agents: [codex, { ...pi, discovered: [] }, { ...gemini, discovered: [] }] },
    );
    await dialog.getByRole("button", { name: "Remove server" }).click();
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole("switch", { name: `Codex · ${key}` })).toBeChecked();
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

test("shows applied server counts for the five enabled agents", async ({ page, desktop }) => {
    const agents = [
        codex,
        ...["Pi", "Gemini", "Hermes", "OpenCode"].map((name) =>
            Object.assign({}, codex, { id: name.toLowerCase(), name }),
        ),
    ];
    await desktop.open({
        agents: [
            ...agents,
            { ...codex, id: "disabled-agent", name: "Disabled agent", enabled: false },
        ],
    });

    const applied = page.getByRole("region", { name: "Applied servers" });
    await expect(applied.getByRole("listitem")).toHaveText(
        agents.map((agent) => new RegExp(`^${agent.name}\\s*0$`)),
    );
});

test("updates a settings folder and enables the agent", async ({ page, desktop }) => {
    const missing = { ...codex, enabled: false, folder: null, config_file: null };
    await desktop.open({ agents: [missing], servers: [fixtureServer] });
    const assignment = page.getByRole("switch", { name: "Codex · fixture" });
    await page.getByRole("button", { name: "Library" }).click();
    await expect(assignment).toHaveCount(0);
    await page.getByRole("button", { name: "Settings" }).click();
    const heading = page.getByRole("heading", { name: "Codex" });
    await expect(heading).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("button", { name: "Agents" })).toHaveCount(
        0,
    );
    await expect(page.getByRole("switch", { name: "Manage · Codex" })).toBeDisabled();
    await page.getByRole("button", { name: "Set folder" }).click();
    const dialog = page.getByRole("dialog");
    const folder = "/fixture/custom-codex";
    desktop.reply(
        { type: "folder", agent: codex.id, folder },
        { agents: [{ ...missing, folder, override_folder: folder }] },
    );
    await dialog.getByLabel("Settings folder").fill(folder);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(folder)).toBeVisible();
    const manage = page.getByRole("switch", { name: "Manage · Codex" });
    await expect(manage).toBeEnabled();
    const updated = { ...missing, folder, override_folder: folder };
    desktop.reply(
        { type: "manage", agent: codex.id, enabled: true },
        { agents: [{ ...updated, enabled: true }] },
    );
    await manage.click();
    await expect(manage).toBeChecked();
    await expect(page.getByRole("button", { name: "Codex · Actions" })).toHaveCount(0);
    await page.getByRole("button", { name: "Library" }).click();
    await expect(assignment).toBeEnabled();
});

test("restores appearance and language from saved settings after reload", async ({
    page,
    desktop,
}) => {
    await desktop.open();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("radio", { name: "Small" })).toBeChecked();
    await expect(
        page.getByRole("radiogroup", { name: "Text size" }).getByRole("radio"),
    ).toHaveCount(3);
    await expect(page.locator("html")).toHaveCSS("font-size", "13px");
    desktop.reply({ type: "settings", theme: "light", locale: "en" }, { theme: "light" });
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const verticalOffset = await page.getByText("Light", { exact: true }).evaluate((option) => {
        const selection = option.getBoundingClientRect();
        const group = option.closest('[role="radiogroup"]')!.getBoundingClientRect();
        return Math.abs(selection.top - group.top - (group.bottom - selection.bottom));
    });
    expect(verticalOffset).toBeLessThan(1);
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
    const gemini = { ...codex, id: "gemini", name: "Gemini", config_file: null };
    await desktop.open({ agents: [codex, pi, gemini], servers: [fixtureServer] });
    const openSettings = () => page.getByRole("button", { name: "Settings", exact: true }).click();
    const cards = page
        .getByRole("region", { name: "Agents", exact: true })
        .getByRole("heading", { level: 3 });
    await openSettings();
    await expect(cards).toHaveText(["Codex", "Pi", "Gemini"]);
    await expect(page.getByTitle("/fixture/.codex/config.toml")).toContainText("config.toml");
    const icon = page.getByRole("region", { name: "Codex" }).locator('img[data-icon-theme="dark"]');
    await expect(icon).toBeVisible();
    await expect
        .poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);

    desktop.reply(
        { type: "agent_order", ids: ["pi", "codex", "gemini"] },
        { agents: [pi, codex, gemini] },
    );
    const handle = await page.getByRole("button", { name: "Reorder agent · Codex" }).boundingBox();
    const sourceSlot = page.locator('[data-agent-card="codex"]');
    const sourceCard = sourceSlot.getByRole("region", { name: "Codex" });
    const beforeDrag = await sourceCard.boundingBox();
    const piCard = await page.locator('[data-agent-card="pi"]').boundingBox();
    const geminiCard = page.locator('[data-agent-card="gemini"]');
    const geminiBounds = await geminiCard.boundingBox();
    expect(handle && piCard && geminiBounds).toBeTruthy();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
        (piCard!.x + piCard!.width + geminiBounds!.x) / 2,
        piCard!.y + piCard!.height / 2,
        { steps: 5 },
    );
    await expect(geminiCard).toHaveAttribute("data-drop-target", "before");
    await expect(sourceCard).toHaveAttribute("data-dragging", "true");
    expect((await sourceCard.boundingBox())!.x).toBeGreaterThan(beforeDrag!.x);
    expect((await sourceSlot.boundingBox())!.x).toBe(beforeDrag!.x);
    await page.mouse.up();
    await expect(geminiCard).not.toHaveAttribute("data-drop-target");
    await expect(sourceCard).not.toHaveAttribute("data-dragging");
    await expect(cards).toHaveText(["Pi", "Codex", "Gemini"]);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const assignments = page.getByRole("switch", { name: /^(Pi|Codex) · fixture$/ });
    await expect(assignments.nth(0)).toHaveAccessibleName("Pi · fixture");
    await expect(assignments.nth(1)).toHaveAccessibleName("Codex · fixture");

    await page.reload();
    await openSettings();
    await expect(cards).toHaveText(["Pi", "Codex", "Gemini"]);

    desktop.reply(
        { type: "agent_order", ids: ["codex", "pi", "gemini"] },
        { agents: [codex, pi, gemini] },
    );
    await page.getByRole("button", { name: "Reorder agent · Codex" }).press("ArrowUp");
    await expect(cards).toHaveText(["Codex", "Pi", "Gemini"]);

    await page.reload();
    await openSettings();
    await expect(cards).toHaveText(["Codex", "Pi", "Gemini"]);
});
