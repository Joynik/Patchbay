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

export interface Agent {
    id: string;
    name: string;
    folder: string | null;
    override_folder: string | null;
    enabled: boolean;
    hidden: boolean;
    supports_http: boolean;
    discovered: { key: string; supported: boolean }[];
    applied: number;
    error: string | null;
}

export interface Snapshot {
    servers: Server[];
    agents: Agent[];
    theme: string;
    locale: string;
    issues: { agent: string; server: string; message: string }[];
}

export type Action =
    | { type: "add"; name: string; description: string; connection: Connection }
    | { type: "describe"; server: string; description: string }
    | { type: "remove"; server: string }
    | { type: "global"; server: string; enabled: boolean }
    | { type: "assign"; server: string; agent: string; enabled: boolean }
    | { type: "manage"; agent: string; enabled: boolean }
    | { type: "hide"; agent: string; hidden: boolean }
    | { type: "folder"; agent: string; folder: string | null }
    | { type: "adopt"; agent: string; key: string }
    | { type: "settings"; theme: string; locale: string }
    | { type: "retry" };

export const load = () => invoke<Snapshot>("snapshot");
export const change = (action: Action) => invoke<Snapshot>("change", { action });
