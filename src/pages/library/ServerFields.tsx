import { Braces } from "lucide-react";
import { useRef, useState } from "react";

import type { Server } from "../../app/api";
import { Select } from "../../components/ui/Select";
import type { Messages } from "../../i18n";
import { parseServerJson } from "./server-json";
import { serverNamePattern } from "./server-validation";

const transports: [string, string][] = [
    ["stdio", "stdio"],
    ["http", "Streamable HTTP"],
];

export function ServerFields({ t, busy, server }: { t: Messages; busy: boolean; server?: Server }) {
    const connection = server?.connection;
    const [name, setName] = useState(server?.name ?? "");
    const [description, setDescription] = useState(server?.description ?? "");
    const [transport, setTransport] = useState<string>(connection?.type ?? "stdio");
    const [command, setCommand] = useState(connection?.type === "stdio" ? connection.command : "");
    const [args, setArgs] = useState(
        connection?.type === "stdio" ? connection.args.join("\n") : "",
    );
    const [url, setUrl] = useState(connection?.type === "http" ? connection.url : "");
    const [source, setSource] = useState("");
    const [invalid, setInvalid] = useState(false);
    const importPanel = useRef<HTMLDetailsElement>(null);
    const nameInput = useRef<HTMLInputElement>(null);

    function fillFromJson() {
        try {
            const fields = parseServerJson(source);
            setName(fields.name ?? name);
            setDescription(fields.description ?? description);
            setTransport(fields.transport);
            if (fields.transport === "http") {
                setUrl(fields.url ?? "");
            } else {
                setCommand(fields.command ?? "");
                setArgs(fields.args ?? "");
            }
            setInvalid(false);
            for (const field of ["command", "args"]) {
                const input = nameInput.current?.form?.elements.namedItem(field);
                if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                    input.setCustomValidity("");
                }
            }
            if (importPanel.current) {
                importPanel.current.open = false;
            }
            nameInput.current?.focus();
        } catch {
            setInvalid(true);
        }
    }

    return (
        <>
            <details className="json-import" ref={importPanel}>
                <summary>
                    <Braces size={17} />
                    {t.importJson}
                </summary>
                <div className="stack">
                    <textarea
                        className="mono"
                        aria-label={t.importJson}
                        aria-invalid={invalid}
                        value={source}
                        rows={4}
                        placeholder={
                            '{ "my-server": { "command": "my-command", "args": ["--flag"] } }'
                        }
                        onChange={(event) => {
                            setSource(event.target.value);
                            setInvalid(false);
                        }}
                    />
                    {invalid && (
                        <p role="alert" className="error text-sm">
                            {t.invalidJson}
                        </p>
                    )}
                    <button
                        type="button"
                        className="button justify-self-start"
                        disabled={busy || !source.trim()}
                        onClick={fillFromJson}
                    >
                        {t.fillFields}
                    </button>
                </div>
            </details>
            <div className="server-field-row">
                <label className="field">
                    {t.name}
                    <input
                        ref={nameInput}
                        name="name"
                        required
                        pattern={name === server?.name ? undefined : serverNamePattern}
                        title={t.invalidServerName}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <div className="field">
                    <label htmlFor="server-transport">{t.transport}</label>
                    <Select
                        id="server-transport"
                        value={transport}
                        options={transports}
                        disabled={busy}
                        onChange={setTransport}
                    />
                    <input type="hidden" name="transport" value={transport} />
                </div>
            </div>
            {transport === "http" ? (
                <label className="field">
                    {t.url}
                    <input
                        name="url"
                        type="url"
                        required
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                    />
                </label>
            ) : (
                <>
                    <label className="field">
                        {t.command}
                        <input
                            name="command"
                            required
                            value={command}
                            onChange={(event) => setCommand(event.target.value)}
                        />
                    </label>
                    <label className="field">
                        {t.args}
                        <textarea
                            name="args"
                            rows={3}
                            value={args}
                            onChange={(event) => setArgs(event.target.value)}
                        />
                    </label>
                </>
            )}
            <label className="field">
                {t.description}
                <textarea
                    name="description"
                    rows={2}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                />
            </label>
        </>
    );
}
