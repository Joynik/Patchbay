import { expect, test as base } from "@playwright/test";

import type { Action, Agent, Server, Snapshot } from "../../src/app/api";

export const codex: Agent = {
    id: "codex",
    name: "Codex",
    folder: "/fixture/.codex",
    override_folder: null,
    config_file: "/fixture/.codex/config.toml",
    enabled: true,
    hidden: false,
    supports_http: true,
    discovered: [],
    applied: 0,
    error: null,
};

export const fixtureServer: Server = {
    id: "server-1",
    key: "fixture",
    name: "fixture",
    description: "Local fixture",
    enabled: true,
    connection: { type: "stdio", command: "/usr/bin/true", args: [] },
    agents: [],
};

type Reply = { action: Action; result: Partial<Snapshot> | Error };

type Desktop = {
    open: (initial?: Partial<Snapshot>) => Promise<void>;
    reply: (action: Action, result: Reply["result"]) => void;
};

export const test = base.extend<{ desktop: Desktop }>({
    desktop: async ({ page }, use) => {
        const replies: Reply[] = [];
        const unexpected: unknown[] = [];
        let state: Snapshot = {
            agents: [codex],
            servers: [],
            locale: "en",
            theme: "dark",
            text_size: "default",
            issues: [],
        };

        await page.exposeFunction(
            "patchbayFixture",
            (command: string, args?: { action: Action }) => {
                if (command === "snapshot") {
                    return state;
                }
                const reply = replies.shift();
                try {
                    expect(command).toBe("change");
                    expect(args?.action).toEqual(reply?.action);
                    if (!reply) {
                        throw new Error("Unexpected desktop command");
                    }
                } catch (error) {
                    unexpected.push(error);
                    throw error;
                }
                if (reply.result instanceof Error) {
                    throw reply.result;
                }
                state = { ...state, ...reply.result };
                return state;
            },
        );
        await page.addInitScript(() => {
            Object.defineProperty(window, "__TAURI_INTERNALS__", {
                value: { invoke: Reflect.get(window, "patchbayFixture") },
            });
        });
        await use({
            open: async (initial) => {
                state = { ...state, ...initial };
                await page.goto("/");
                await expect(page.getByRole("button", { name: "Rescan" })).toBeEnabled();
            },
            reply: (action, result) => replies.push({ action, result }),
        });
        expect(replies).toHaveLength(0);
        expect(unexpected).toEqual([]);
    },
});
