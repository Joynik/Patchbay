import { Plug, Radar, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Action, Agent, Connection, Server } from "../../app/api";
import { AgentIcon } from "../../components/ui/AgentIcon";
import { Modal } from "../../components/ui/Modal";
import type { Messages } from "../../i18n";
import { type AdoptionOption, AdoptionReview, sameConnection } from "./AdoptionReview";

type Entry = {
    agent: Agent;
    supported: boolean;
    connection?: Connection | null;
    revision?: string;
};

export function DiscoveredServers({
    agents,
    servers,
    editServer,
    t,
    busy,
    act,
}: {
    agents: Agent[];
    servers: Server[];
    editServer: (server: Server) => void;
    t: Messages;
    busy: boolean;
    act: (action: Action) => Promise<boolean>;
}) {
    const [review, setReview] = useState<{
        key: string;
        existing?: Server;
        options: AdoptionOption[];
    }>();
    const [removal, setRemoval] = useState<{ key: string; entries: Entry[] }>();
    const groups = new Map<string, Entry[]>();
    for (const agent of agents) {
        for (const { key, supported, connection, revision } of agent.discovered) {
            const entries = groups.get(key) ?? [];
            entries.push({ agent, supported, connection, revision });
            groups.set(key, entries);
        }
    }

    function manage(key: string, entries: Entry[]) {
        const options: AdoptionOption[] = [];
        const supported = entries.filter((entry) => entry.supported);
        for (const { agent, connection } of supported) {
            if (!connection) {
                continue;
            }
            const option = options.find((candidate) =>
                sameConnection(candidate.connection, connection),
            );
            if (option) {
                option.agents.push(agent);
            } else {
                options.push({ connection, agents: [agent] });
            }
        }
        const existing = servers.find((server) => server.key === key);
        if (
            options.length > 1 ||
            (existing &&
                options.some(({ connection }) => !sameConnection(existing.connection, connection)))
        ) {
            setReview({ key, existing, options });
            return;
        }
        void act({
            type: "adopt",
            agents: supported.map(({ agent }) => agent.id),
            key,
            expected: options[0]?.connection,
        });
    }

    return (
        <section aria-labelledby="discovered-servers" className="stack">
            <h2 id="discovered-servers" className="section-heading">
                <Radar size={17} />
                {t.found}
            </h2>
            {groups.size === 0 ? (
                <p className="panel muted">{t.noDiscoveries}</p>
            ) : (
                <div className="table-frame">
                    <table className="discovered-table">
                        <thead>
                            <tr>
                                <th scope="col">{t.name}</th>
                                <th scope="col">{t.agents}</th>
                                <th scope="col">
                                    <span className="sr-only">{t.actions}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(groups, ([key, entries]) => (
                                <tr key={key}>
                                    <th scope="row">
                                        <code>{key}</code>
                                    </th>
                                    <td>
                                        <ul className="discovery-agents">
                                            {entries.map(({ agent, supported }) => (
                                                <li
                                                    key={agent.id}
                                                    data-unsupported={!supported || undefined}
                                                    title={
                                                        supported
                                                            ? agent.name
                                                            : `${agent.name} · ${t.unsupported}`
                                                    }
                                                >
                                                    <AgentIcon id={agent.id} />
                                                    <span className="sr-only">
                                                        {agent.name}
                                                        {!supported && ` · ${t.unsupported}`}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td>
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                className="icon-button"
                                                title={t.manage}
                                                aria-label={`${t.manage} · ${key}`}
                                                disabled={
                                                    busy ||
                                                    entries.every(({ supported }) => !supported)
                                                }
                                                onClick={() => manage(key, entries)}
                                            >
                                                <Plug size={15} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-button"
                                                aria-label={`${t.remove} · ${key}`}
                                                title={t.remove}
                                                disabled={
                                                    busy ||
                                                    entries.some(({ revision }) => !revision)
                                                }
                                                onClick={() => setRemoval({ key, entries })}
                                            >
                                                <Trash2 size={15} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {removal && (
                <Modal
                    open
                    title={`${t.remove} · ${removal.key}`}
                    closeLabel={t.close}
                    setOpen={(open) => {
                        if (!open && !busy) {
                            setRemoval(undefined);
                        }
                    }}
                >
                    <div className="stack mt-4">
                        <p>{t.confirmRemoveDiscovered}</p>
                        <ul className="list-disc pl-5">
                            {removal.entries.map(({ agent }) => (
                                <li key={agent.id}>{agent.name}</li>
                            ))}
                        </ul>
                        <div className="actions">
                            <button
                                type="button"
                                className="button"
                                disabled={busy}
                                onClick={() => setRemoval(undefined)}
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                className="button remove-discovered"
                                disabled={busy}
                                onClick={async () => {
                                    const targets = removal.entries.flatMap(
                                        ({ agent, revision }) =>
                                            revision ? [{ agent: agent.id, revision }] : [],
                                    );
                                    if (targets.length === removal.entries.length) {
                                        await act({
                                            type: "remove_discovered",
                                            key: removal.key,
                                            targets,
                                        });
                                    }
                                    setRemoval(undefined);
                                }}
                            >
                                {t.remove}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            {review && (
                <AdoptionReview
                    serverKey={review.key}
                    existing={review.existing}
                    options={review.options}
                    busy={busy}
                    t={t}
                    close={() => setReview(undefined)}
                    editServer={(server) => {
                        setReview(undefined);
                        editServer(server);
                    }}
                    adopt={async ({ agents: sources, connection }) => {
                        await act({
                            type: "adopt",
                            key: review.key,
                            agents: sources.map(({ id }) => id),
                            expected: connection,
                        });
                        setReview(undefined);
                    }}
                />
            )}
        </section>
    );
}
