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
    await dialog.getByLabel("Transport").selectOption("http");
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
    await desktop.open({
        agents: [
            {
                ...codex,
                enabled: false,
                discovered: [{ key: adopted.key, supported: true }, unmanaged],
            },
        ],
    });
    await page.getByRole("button", { name: "Agents" }).click();
    const entry = page.getByRole("listitem").filter({ hasText: /^fixture/ });
    desktop.reply(
        { type: "adopt", agent: codex.id, key: adopted.key },
        {
            servers: [adopted],
            agents: [{ ...codex, discovered: [unmanaged], applied: 1 }],
        },
    );
    await entry.getByRole("button", { name: "Take under management" }).click();
    await expect(entry).toBeHidden();
    await expect(page.getByText("other", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Manage" })).toBeChecked();
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.getByRole("switch", { name: "Codex · fixture" })).toBeChecked();
    await expect(page.getByRole("rowheader", { name: /other/ })).toBeHidden();
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
    await expect(page.getByRole("switch", { name: "Manage" })).toBeDisabled();
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
    await expect(page.getByRole("switch", { name: "Manage" })).toBeEnabled();
});

test("restores appearance and language from saved settings after reload", async ({
    page,
    desktop,
}) => {
    await desktop.open();
    await page.getByRole("button", { name: "Settings" }).click();
    desktop.reply({ type: "settings", theme: "light", locale: "en" }, { theme: "light" });
    await page.getByLabel("Appearance").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    desktop.reply({ type: "settings", theme: "light", locale: "uk" }, { locale: "uk" });
    await page.getByLabel("Language").selectOption("uk");
    await expect(page.getByRole("heading", { name: "Налаштування" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Огляд" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
