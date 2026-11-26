import { invoke } from "@tauri-apps/api/core";

export type Connection =
    { type: "stdio"; command: string; args: string[] } | { type: "http"; url: string };

export interface Server {
    id: string;
    key: string;
    name: string;
    description: string;
    enabled: boolean;
    connection: Connection;
    agents: string[];
}

export type TextSize = "small" | "default" | "large";

export interface Agent {
    id: string;
    name: string;
    folder: string | null;
    override_folder: string | null;
    config_file: string | null;
    enabled: boolean;
    supports_http: boolean;
    discovered: {
        key: string;
        supported: boolean;
        connection?: Connection | null;
        revision?: string;
    }[];
    applied: number;
    error: string | null;
}

export interface Snapshot {
    servers: Server[];
    agents: Agent[];
    theme: string;
    locale: string;
    text_size: TextSize;
    issues: { agent: string; server: string; message: string }[];
}

export type Action =
    | { type: "add"; name: string; description: string; connection: Connection }
    | { type: "edit"; server: string; name: string; description: string; connection: Connection }
    | { type: "remove"; server: string }
    | { type: "release"; server: string }
    | { type: "global"; server: string; enabled: boolean }
    | { type: "assign"; server: string; agent: string; enabled: boolean }
    | { type: "manage"; agent: string; enabled: boolean }
    | { type: "folder"; agent: string; folder: string | null }
    | { type: "adopt"; agents: string[]; key: string; expected?: Connection }
    | { type: "remove_discovered"; key: string; targets: { agent: string; revision: string }[] }
    | { type: "settings"; theme: string; locale: string }
    | { type: "text_size"; size: TextSize }
    | { type: "agent_order"; ids: string[] }
    | { type: "retry" };

export const load = () => invoke<Snapshot>("snapshot");
export const change = (action: Action) => invoke<Snapshot>("change", { action });
