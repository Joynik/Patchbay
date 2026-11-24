import { FolderCog } from "lucide-react";
import { useState } from "react";

import type { Action, Agent, Snapshot } from "../app/api";
import { Modal } from "../components/ui/Modal";
import { Switch } from "../components/ui/Switch";
import type { Messages } from "../i18n";

export function Agents({
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
    const [showHidden, setShowHidden] = useState(false);
    const [editing, setEditing] = useState<Agent | null>(null);
    const [folder, setFolder] = useState("");

    return (
        <div className="stack">
            {data.agents.some((agent) => agent.hidden) && (
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(event) => setShowHidden(event.target.checked)}
                    />
                    {t.showHidden}
                </label>
            )}
            {data.agents
                .filter((agent) => showHidden || !agent.hidden)
                .map((agent) => (
                    <section className="panel" key={agent.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2>{agent.name}</h2>
                                <p className="path">{agent.folder ?? t.missing}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2">
                                    <Switch
                                        checked={agent.enabled}
                                        disabled={busy || (!agent.folder && !agent.enabled)}
                                        onCheckedChange={(enabled) =>
                                            void act({ type: "manage", agent: agent.id, enabled })
                                        }
                                    />
                                    {t.manage}
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={agent.hidden}
                                        disabled={busy}
                                        onChange={(event) =>
                                            void act({
                                                type: "hide",
                                                agent: agent.id,
                                                hidden: event.target.checked,
                                            })
                                        }
                                    />
                                    {t.hide}
                                </label>
                                <button
                                    className="icon-button"
                                    title={t.setFolder}
                                    aria-label={t.setFolder}
                                    disabled={busy}
                                    onClick={() => {
                                        setFolder(agent.override_folder ?? agent.folder ?? "");
                                        setEditing(agent);
                                    }}
                                >
                                    <FolderCog size={18} />
                                </button>
                            </div>
                        </div>
                        {agent.error && <p className="error mt-3">{agent.error}</p>}
                        {agent.discovered.length > 0 && (
                            <div className="mt-5">
                                <h3 className="muted">{t.found}</h3>
                                <ul className="divide-y divide-[var(--line)]">
                                    {agent.discovered.map((entry) => (
                                        <li
                                            key={entry.key}
                                            className="flex items-center justify-between gap-3 py-2"
                                        >
                                            <code>{entry.key}</code>
                                            {entry.supported ? (
                                                <button
                                                    className="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void act({
                                                            type: "adopt",
                                                            agent: agent.id,
                                                            key: entry.key,
                                                        })
                                                    }
                                                >
                                                    {t.adopt}
                                                </button>
                                            ) : (
                                                <span className="muted">{t.unsupported}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                ))}
            <Modal
                open={editing !== null}
                setOpen={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                title={t.setFolder}
                closeLabel={t.close}
            >
                {editing && (
                    <form
                        className="stack mt-4"
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (await act({ type: "folder", agent: editing.id, folder })) {
                                setEditing(null);
                            }
                        }}
                    >
                        <label className="field">
                            {t.folder}
                            <input
                                required
                                value={folder}
                                onChange={(event) => setFolder(event.target.value)}
                            />
                        </label>
                        <div className="actions">
                            {editing.override_folder && (
                                <button
                                    type="button"
                                    className="button"
                                    disabled={busy}
                                    onClick={async () => {
                                        if (
                                            await act({
                                                type: "folder",
                                                agent: editing.id,
                                                folder: null,
                                            })
                                        ) {
                                            setEditing(null);
                                        }
                                    }}
                                >
                                    {t.resetFolder}
                                </button>
                            )}
                            <button className="button primary" disabled={busy}>
                                {t.save}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}
