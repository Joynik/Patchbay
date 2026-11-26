import { CircleCheck, CircleMinus, Layers, Plug } from "lucide-react";

import type { Snapshot } from "../app/api";
import { AgentIcon } from "../components/ui/AgentIcon";
import type { Messages } from "../i18n";

export function Dashboard({ data, t }: { data: Snapshot; t: Messages }) {
    const enabled = data.servers.filter((server) => server.enabled).length;
    const managedAgents = data.agents.filter((agent) => agent.enabled);
    const metrics = [
        [t.servers, data.servers.length, Layers, true],
        [t.enabled, enabled, CircleCheck, true],
        [t.disabled, data.servers.length - enabled, CircleMinus, true],
        [t.agents, managedAgents.length, Plug, false],
    ] as const;

    return (
        <div className="stack">
            <dl className="metrics">
                {metrics.map(([label, value, Icon, serverMetric]) => (
                    <div key={label} data-server-metric={serverMetric || undefined}>
                        <dt>
                            <Icon size={16} />
                            {label}
                        </dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            <section className="panel" aria-labelledby="applied-servers">
                <h2 id="applied-servers">{t.applied}</h2>
                <ul className="divide-y divide-[var(--line)]">
                    {managedAgents.map((agent) => (
                        <li key={agent.id} className="flex items-center justify-between gap-3 py-3">
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
