import { CircleCheck, CircleMinus, FolderSearch, Layers, Plug } from "lucide-react";

import type { Snapshot } from "../app/api";
import { AgentIcon } from "../components/ui/AgentIcon";
import type { Messages } from "../i18n";

export function Dashboard({ data, t }: { data: Snapshot; t: Messages }) {
    const enabled = data.servers.filter((server) => server.enabled).length;
    const metrics = [
        [t.servers, data.servers.length, Layers],
        [t.enabled, enabled, CircleCheck],
        [t.disabled, data.servers.length - enabled, CircleMinus],
        [t.folders, data.agents.filter((agent) => agent.folder).length, FolderSearch],
        [t.managed, data.agents.filter((agent) => agent.enabled).length, Plug],
    ] as const;

    return (
        <div className="stack">
            <dl className="metrics">
                {metrics.map(([label, value, Icon]) => (
                    <div key={label}>
                        <dt>
                            <Icon size={16} />
                            {label}
                        </dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            <section className="panel">
                <h2>{t.applied}</h2>
                <ul className="divide-y divide-[var(--line)]">
                    {data.agents
                        .filter((agent) => !agent.hidden)
                        .map((agent) => (
                            <li
                                key={agent.id}
                                className="flex items-center justify-between gap-3 py-3"
                            >
                                <span className="flex items-center gap-2">
                                    <AgentIcon id={agent.id} />
                                    {agent.name}
                                </span>
                                <span className="mono">{agent.applied}</span>
                            </li>
                        ))}
                </ul>
            </section>
        </div>
    );
}
