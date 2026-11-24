import type { Snapshot } from "../app/api";
import type { Messages } from "../i18n";

export function Dashboard({ data, t }: { data: Snapshot; t: Messages }) {
    const enabled = data.servers.filter((server) => server.enabled).length;
    const metrics = [
        [t.servers, data.servers.length],
        [t.enabled, enabled],
        [t.disabled, data.servers.length - enabled],
        [t.folders, data.agents.filter((agent) => agent.folder).length],
        [t.managed, data.agents.filter((agent) => agent.enabled).length],
    ] as const;

    return (
        <div className="stack">
            <dl className="metrics">
                {metrics.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
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
                                <span>{agent.name}</span>
                                <span className="mono">{agent.applied}</span>
                            </li>
                        ))}
                </ul>
            </section>
        </div>
    );
}
