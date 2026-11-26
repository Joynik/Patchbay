import { Cable, Pencil, Plus, Trash2, Unplug } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { Action, Connection, Server, Snapshot } from "../app/api";
import { AgentIcon } from "../components/ui/AgentIcon";
import { Modal } from "../components/ui/Modal";
import { Switch } from "../components/ui/Switch";
import type { Messages } from "../i18n";
import { DiscoveredServers } from "./library/DiscoveredServers";
import { parseArguments, validArgument, validCommand } from "./library/server-validation";
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
    const [dialog, setDialog] = useState<"add" | "edit" | "remove" | "release" | null>(null);
    const [server, setServer] = useState<Server | null>(null);
    const agents = data.agents.filter((agent) => agent.enabled);
    const byName = new Intl.Collator(data.locale, { sensitivity: "base", numeric: true });
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted is outside the current TypeScript target.
    const servers = [...data.servers].sort((first, second) =>
        byName.compare(first.name, second.name),
    );

    const confirmation = dialog === "remove" || dialog === "release";
    const title =
        dialog === "edit"
            ? t.edit
            : dialog === "remove"
              ? t.remove
              : dialog === "release"
                ? t.release
                : t.add;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        const field = (key: string) => String(fields.get(key) ?? "");
        let action: Action;
        if (confirmation && server) {
            action = { type: dialog, server: server.id };
        } else {
            const original = dialog === "edit" ? server?.connection : undefined;
            const inputArgs = field("args");
            const command = field("command");
            const originalStdio = original?.type === "stdio" ? original : undefined;
            const keptArgs = originalStdio && inputArgs === originalStdio.args.join("\n");
            const args = keptArgs ? originalStdio.args : parseArguments(inputArgs);
            if (field("transport") !== "http") {
                if (command !== originalStdio?.command && !validCommand(command)) {
                    const input = form.querySelector<HTMLInputElement>('input[name="command"]');
                    input?.setCustomValidity(t.invalidServerCommand);
                    input?.reportValidity();
                    return;
                }
                if (!keptArgs && !args.every(validArgument)) {
                    const input = form.querySelector<HTMLTextAreaElement>('textarea[name="args"]');
                    input?.setCustomValidity(t.invalidServerArgs);
                    input?.reportValidity();
                    return;
                }
            }
            const connection: Connection =
                field("transport") === "http"
                    ? { type: "http", url: field("url").trim() }
                    : {
                          type: "stdio",
                          command,
                          args,
                      };
            const values = { name: field("name"), description: field("description"), connection };
            action =
                dialog === "edit" && server
                    ? { type: "edit", server: server.id, ...values }
                    : { type: "add", ...values };
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
                                {servers.map((item) => (
                                    <tr key={item.id}>
                                        <th scope="row">{item.name}</th>
                                        <td
                                            className="server-description"
                                            title={item.description || undefined}
                                        >
                                            {item.description}
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
                                                    title={t.release}
                                                    aria-label={t.release}
                                                    onClick={() => {
                                                        setServer(item);
                                                        setDialog("release");
                                                    }}
                                                >
                                                    <Unplug size={15} />
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
            <DiscoveredServers
                agents={data.agents}
                servers={data.servers}
                t={t}
                busy={busy}
                act={act}
                editServer={(item) => {
                    setServer(item);
                    setDialog("edit");
                }}
            />
            <Modal
                wide={!confirmation}
                open={dialog !== null}
                setOpen={(open) => {
                    if (!open) {
                        setDialog(null);
                    }
                }}
                closeLabel={t.close}
                title={title}
            >
                <form
                    key={dialog}
                    className="stack mt-4"
                    onSubmit={submit}
                    onInput={(event) => {
                        const input = event.target;
                        if (
                            input instanceof HTMLInputElement ||
                            input instanceof HTMLTextAreaElement
                        ) {
                            input.setCustomValidity("");
                        }
                    }}
                >
                    {confirmation ? (
                        <p>{dialog === "release" ? t.confirmRelease : t.confirmRemove}</p>
                    ) : (
                        <ServerFields
                            t={t}
                            busy={busy}
                            server={dialog === "edit" ? (server ?? undefined) : undefined}
                        />
                    )}
                    <div className="actions">
                        <button type="button" className="button" onClick={() => setDialog(null)}>
                            {t.cancel}
                        </button>
                        <button
                            className={dialog === "remove" ? "button danger" : "button primary"}
                            disabled={busy}
                        >
                            {confirmation ? title : t.save}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
