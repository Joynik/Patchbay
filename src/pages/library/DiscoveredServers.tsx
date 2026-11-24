import { Radar } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import type { Action, Agent } from "../../app/api";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { AgentIcon } from "../../components/ui/AgentIcon";
import type { Messages } from "../../i18n";

export function DiscoveredServers({
    agents,
    t,
    busy,
    act,
}: {
    agents: Agent[];
    t: Messages;
    busy: boolean;
    act: (action: Action) => Promise<boolean>;
}) {
    const groups = new Map<string, { agent: Agent; supported: boolean }[]>();
    for (const agent of agents.filter((item) => !item.hidden)) {
        for (const { key, supported } of agent.discovered) {
            const entries = groups.get(key) ?? [];
            entries.push({ agent, supported });
            groups.set(key, entries);
        }
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
                                                    title={supported ? agent.name : t.unsupported}
                                                >
                                                    <AgentIcon id={agent.id} />
                                                    {agent.name}
                                                    {!supported && (
                                                        <span className="sr-only">
                                                            {t.unsupported}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td>
                                        <ActionMenu
                                            label={t.adopt + " · " + key}
                                            disabled={
                                                busy || entries.every((entry) => !entry.supported)
                                            }
                                        >
                                            {entries.map(({ agent, supported }) => (
                                                <DropdownMenu.Item
                                                    className="select-option"
                                                    key={agent.id}
                                                    disabled={!supported}
                                                    onSelect={() =>
                                                        void act({
                                                            type: "adopt",
                                                            agent: agent.id,
                                                            key,
                                                        })
                                                    }
                                                >
                                                    <AgentIcon id={agent.id} />
                                                    {agent.name}
                                                    {!supported && (
                                                        <span className="text-xs muted">
                                                            {t.unsupported}
                                                        </span>
                                                    )}
                                                </DropdownMenu.Item>
                                            ))}
                                        </ActionMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
