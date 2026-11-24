type Fields = {
    name?: string;
    description?: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string;
    url?: string;
};

function object(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error();
    }
    return value as Record<string, unknown>;
}

export function parseServerJson(source: string): Fields {
    const text = source.trim();
    const root = object(JSON.parse(text.startsWith('"') ? `{${text}}` : text));
    const direct = typeof root.command === "string" || typeof root.url === "string";
    const entries = Object.entries("mcpServers" in root ? object(root.mcpServers) : root);
    if (!direct && entries.length !== 1) {
        throw new Error();
    }

    const [key, config] = direct ? [undefined, root] : entries[0];
    const { name = key, description, type, command, args, url, ...extra } = object(config);
    if (
        Object.keys(extra).length ||
        (name !== undefined && (typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name))) ||
        (description !== undefined && typeof description !== "string")
    ) {
        throw new Error();
    }

    if (
        typeof url === "string" &&
        command === undefined &&
        args === undefined &&
        (type === undefined || type === "http" || type === "streamable-http")
    ) {
        const endpoint = new URL(url);
        if (endpoint.protocol === "https:" || endpoint.protocol === "http:") {
            return { name, description, transport: "http", url };
        }
    }
    if (
        typeof command === "string" &&
        command.trim() &&
        url === undefined &&
        (type === undefined || type === "stdio") &&
        (args === undefined ||
            (Array.isArray(args) &&
                args.every(
                    (arg) => typeof arg === "string" && arg.length > 0 && !/[\r\n]/.test(arg),
                )))
    ) {
        return { name, description, transport: "stdio", command, args: args?.join("\n") };
    }
    throw new Error();
}
