import { Cable, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { Action, Connection, Server, Snapshot } from "../app/api";
import { AgentIcon } from "../components/ui/AgentIcon";
import { Modal } from "../components/ui/Modal";
import { Switch } from "../components/ui/Switch";
import type { Messages } from "../i18n";
import { DiscoveredServers } from "./library/DiscoveredServers";
import { ServerFields } from "./library/ServerFields";

export function Library({
    data,
    t,
    act,
    busy,
}: {
    data: Snapshot;
    t: Messages;
    act: (action: Action) => Promise<boolean>;
    busy: boolean;
}) {
    const [dialog, setDialog] = useState<"add" | "edit" | "remove" | null>(null);
    const [server, setServer] = useState<Server | null>(null);
    const agents = data.agents.filter((agent) => !agent.hidden);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const field = (key: string) => String(fields.get(key) ?? "");
        let action: Action;
        if (dialog === "edit" && server) {
            action = { type: "describe", server: server.id, description: field("description") };
        } else if (dialog === "remove" && server) {
            action = { type: "remove", server: server.id };
        } else {
            const connection: Connection =
                field("transport") === "http"
                    ? { type: "http", url: field("url").trim() }
                    : {
                          type: "stdio",
                          command: field("command").trim(),
                          args: field("args")
                              .split(/\r?\n/)
                              .filter((arg) => arg !== ""),
                      };
            action = {
                type: "add",
                name: field("name"),
                description: field("description"),
                connection,
            };
        }
        if (await act(action)) {
            setDialog(null);
        }
    }

    return (
        <div className="library-layout">
            <section className="stack" aria-labelledby="managed-servers">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="managed-servers" className="section-heading">
                        <Cable size={17} />
                        {t.managedServers}
                    </h2>
                    <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => {
                            setServer(null);
                            setDialog("add");
                        }}
                    >
                        <Plus size={17} />
                        {t.add}
                    </button>
                </div>
                {data.servers.length === 0 ? (
                    <div className="panel empty">{t.empty}</div>
                ) : (
                    <div className="table-frame">
                        <table className="managed-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t.name}</th>
                                    <th scope="col">{t.description}</th>
                                    <th scope="col">{t.agents}</th>
                                    <th scope="col">{t.global}</th>
                                    <th scope="col">
                                        <span className="sr-only">{t.actions}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.servers.map((item) => (
                                    <tr key={item.id}>
                                        <th scope="row">{item.name}</th>
                                        <td
                                            className="server-description"
                                            title={item.description || undefined}
                                        >
                                            {item.description ||
                                                (item.connection.type === "http"
                                                    ? "Streamable HTTP"
                                                    : "stdio")}
                                        </td>
                                        <td>
                                            <div className="agent-assignments">
                                                {agents.map((agent) => (
                                                    <button
                                                        key={agent.id}
                                                        type="button"
                                                        role="switch"
                                                        className="agent-assignment"
                                                        aria-checked={item.agents.includes(
                                                            agent.id,
                                                        )}
                                                        title={agent.name}
                                                        disabled={
                                                            busy ||
                                                            !agent.enabled ||
                                                            !agent.folder ||
                                                            (!agent.supports_http &&
                                                                item.connection.type === "http")
                                                        }
                                                        aria-label={`${agent.name} · ${item.name}`}
                                                        onClick={() =>
                                                            void act({
                                                                type: "assign",
                                                                server: item.id,
                                                                agent: agent.id,
                                                                enabled: !item.agents.includes(
                                                                    agent.id,
                                                                ),
                                                            })
                                                        }
                                                    >
                                                        <AgentIcon id={agent.id} />
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <Switch
                                                checked={item.enabled}
                                                disabled={busy}
                                                aria-label={`${t.global} · ${item.name}`}
                                                onCheckedChange={(enabled) =>
                                                    void act({
                                                        type: "global",
                                                        server: item.id,
                                                        enabled,
                                                    })
                                                }
                                            />
                                        </td>
                                        <td>
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    className="icon-button"
                                                    disabled={busy}
                                                    title={t.edit}
                                                    aria-label={t.edit}
                                                    onClick={() => {
                                                        setServer(item);
                                                        setDialog("edit");
                                                    }}
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    className="icon-button"
                                                    disabled={busy}
                                                    title={t.remove}
                                                    aria-label={t.remove}
                                                    onClick={() => {
                                                        setServer(item);
                                                        setDialog("remove");
                                                    }}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            <DiscoveredServers agents={data.agents} t={t} busy={busy} act={act} />
            <Modal
                wide={dialog === "add"}
                open={dialog !== null}
                setOpen={(open) => {
                    if (!open) {
                        setDialog(null);
                    }
                }}
                closeLabel={t.close}
                title={dialog === "edit" ? t.edit : dialog === "remove" ? t.remove : t.add}
            >
                <form key={dialog} className="stack mt-4" onSubmit={submit}>
                    {dialog === "add" && <ServerFields t={t} busy={busy} />}
                    {dialog === "remove" ? (
                        <p>{t.confirmRemove}</p>
                    ) : (
                        dialog === "edit" && (
                            <label className="field">
                                {t.description}
                                <textarea
                                    name="description"
                                    defaultValue={server?.description}
                                    rows={2}
                                />
                            </label>
                        )
                    )}
                    <div className="actions">
                        <button type="button" className="button" onClick={() => setDialog(null)}>
                            {t.cancel}
                        </button>
                        <button
                            className={dialog === "remove" ? "button danger" : "button primary"}
                            disabled={busy}
                        >
                            {dialog === "remove" ? t.remove : t.save}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
