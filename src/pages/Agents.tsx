import { FileCog, GripVertical, Pencil } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";

import type { Action, Agent, Snapshot } from "../app/api";
import { ActionMenu } from "../components/ui/ActionMenu";
import { AgentIcon } from "../components/ui/AgentIcon";
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
    const [dragging, setDragging] = useState<string>();
    const [dropTarget, setDropTarget] = useState<string>();
    const visible = data.agents.filter((agent) => showHidden || !agent.hidden);

    function move(agent: string, target: string) {
        if (busy || agent === target) {
            return;
        }
        const ids = data.agents.map((item) => item.id);
        const index = ids.indexOf(target);
        ids.splice(ids.indexOf(agent), 1);
        ids.splice(index, 0, agent);
        void act({ type: "agent_order", ids });
    }

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
            <div className="agent-grid">
                {visible.map((agent, index) => (
                    <div
                        className="panel agent-card"
                        data-drop-target={dropTarget === agent.id || undefined}
                        key={agent.id}
                        onDragOver={(event) => {
                            if (dragging && dragging !== agent.id && !busy) {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDropTarget(agent.id);
                            }
                        }}
                        onDragLeave={(event) => {
                            if (
                                !(event.relatedTarget instanceof Node) ||
                                !event.currentTarget.contains(event.relatedTarget)
                            ) {
                                setDropTarget(undefined);
                            }
                        }}
                        onDrop={(event) => {
                            if (dragging) {
                                event.preventDefault();
                                move(dragging, agent.id);
                                setDragging(undefined);
                                setDropTarget(undefined);
                            }
                        }}
                    >
                        <section aria-label={agent.name}>
                            <div className="agent-card-header">
                                <button
                                    className="icon-button drag-handle"
                                    draggable={!busy}
                                    disabled={busy || visible.length < 2}
                                    aria-label={`${t.reorderAgent} · ${agent.name}`}
                                    title={t.reorderHint}
                                    onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData("text/plain", agent.id);
                                        setDragging(agent.id);
                                    }}
                                    onDragEnd={() => {
                                        setDragging(undefined);
                                        setDropTarget(undefined);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                            event.preventDefault();
                                            const target =
                                                visible[index + (event.key === "ArrowUp" ? -1 : 1)];
                                            if (target) {
                                                move(agent.id, target.id);
                                            }
                                        }
                                    }}
                                >
                                    <GripVertical size={16} />
                                </button>
                                <AgentIcon id={agent.id} />
                                <h2>{agent.name}</h2>
                                <Switch
                                    checked={agent.enabled}
                                    disabled={busy || (!agent.folder && !agent.enabled)}
                                    aria-label={`${t.manage} · ${agent.name}`}
                                    onCheckedChange={(enabled) =>
                                        void act({ type: "manage", agent: agent.id, enabled })
                                    }
                                />
                            </div>
                            <div className="agent-folder">
                                <p className="path" title={agent.folder ?? undefined}>
                                    {agent.folder ?? t.missing}
                                </p>
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
                                    <Pencil size={15} />
                                </button>
                                <ActionMenu label={agent.name + " · " + t.actions} disabled={busy}>
                                    <DropdownMenu.Item
                                        className="select-option"
                                        onSelect={() =>
                                            void act({
                                                type: "hide",
                                                agent: agent.id,
                                                hidden: !agent.hidden,
                                            })
                                        }
                                    >
                                        {agent.hidden ? t.reveal : t.hide}
                                    </DropdownMenu.Item>
                                </ActionMenu>
                            </div>
                            {agent.config_file && (
                                <p className="agent-config path" title={agent.config_file}>
                                    <FileCog size={14} />
                                    <span className="sr-only">{t.configFile}</span>
                                    {agent.config_file.split(/[\\/]/).at(-1)}
                                </p>
                            )}
                            {agent.error && <p className="error mt-3">{agent.error}</p>}
                        </section>
                    </div>
                ))}
            </div>
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
