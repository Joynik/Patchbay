import { FileCog, GripVertical, Pencil } from "lucide-react";
import { useRef, useState } from "react";

import type { Action, Agent, Snapshot } from "../app/api";
import { AgentIcon } from "../components/ui/AgentIcon";
import { Modal } from "../components/ui/Modal";
import { Switch } from "../components/ui/Switch";
import type { Messages } from "../i18n";

type DropTarget = { id: string; side: "before" | "after" };

function targetAt(grid: HTMLElement, x: number, y: number): DropTarget | undefined {
    const bounds = grid.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        return undefined;
    }

    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-agent-card]"), (card) => ({
        id: card.dataset.agentCard!,
        rect: card.getBoundingClientRect(),
    }));
    if (cards.length === 0) {
        return undefined;
    }

    // Pick the closest row first so the gaps between cards are also valid drop targets.
    const distance = (rect: DOMRect) => Math.max(rect.top - y, y - rect.bottom, 0);
    const closest = cards.reduce((best, card) =>
        distance(card.rect) < distance(best.rect) ? card : best,
    );
    const row = cards.filter(({ rect }) => rect.top === closest.rect.top);
    const next = row.find(({ rect }) => x < rect.left + rect.width / 2);
    return next ? { id: next.id, side: "before" } : { id: row.at(-1)!.id, side: "after" };
}

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
    const [editing, setEditing] = useState<Agent | null>(null);
    const [folder, setFolder] = useState("");
    const grid = useRef<HTMLDivElement>(null);
    const dragOrigin = useRef<{ x: number; y: number }>(null);
    const [drag, setDrag] = useState<{ id: string; style?: { transform: string } }>();
    const [dropTarget, setDropTarget] = useState<DropTarget>();

    function endDrag() {
        dragOrigin.current = null;
        setDrag(undefined);
        setDropTarget(undefined);
    }

    function move(agent: string, target: DropTarget) {
        if (busy || agent === target.id) {
            return;
        }
        const ids = data.agents.map((item) => item.id);
        const original = ids.indexOf(agent);
        ids.splice(original, 1);
        const index = ids.indexOf(target.id) + Number(target.side === "after");
        if (index === original) {
            return;
        }
        ids.splice(index, 0, agent);
        void act({ type: "agent_order", ids });
    }

    return (
        <div className="stack">
            <div className="agent-grid" ref={grid}>
                {data.agents.map((agent, index) => (
                    <div
                        className="agent-card"
                        data-agent-card={agent.id}
                        data-drop-target={dropTarget?.id === agent.id ? dropTarget.side : undefined}
                        key={agent.id}
                    >
                        <section
                            className="panel agent-card-content"
                            aria-label={agent.name}
                            data-dragging={drag?.id === agent.id || undefined}
                            style={drag?.id === agent.id ? drag.style : undefined}
                        >
                            <div className="agent-card-header">
                                <button
                                    className="icon-button drag-handle"
                                    disabled={busy || data.agents.length < 2}
                                    aria-label={`${t.reorderAgent} · ${agent.name}`}
                                    title={t.reorderHint}
                                    onPointerDown={(event) => {
                                        if (event.button === 0 && event.isPrimary) {
                                            event.currentTarget.setPointerCapture(event.pointerId);
                                            dragOrigin.current = {
                                                x: event.clientX,
                                                y: event.clientY,
                                            };
                                            setDrag({ id: agent.id });
                                        }
                                    }}
                                    onPointerMove={(event) => {
                                        const origin = dragOrigin.current;
                                        if (
                                            origin &&
                                            event.currentTarget.hasPointerCapture(
                                                event.pointerId,
                                            ) &&
                                            grid.current
                                        ) {
                                            const x = event.clientX - origin.x;
                                            const y = event.clientY - origin.y;
                                            setDrag({
                                                id: agent.id,
                                                style: { transform: `translate(${x}px, ${y}px)` },
                                            });
                                            const target = targetAt(
                                                grid.current,
                                                event.clientX,
                                                event.clientY,
                                            );
                                            setDropTarget(
                                                target?.id !== agent.id ? target : undefined,
                                            );
                                        }
                                    }}
                                    onPointerUp={(event) => {
                                        if (
                                            event.currentTarget.hasPointerCapture(
                                                event.pointerId,
                                            ) &&
                                            grid.current
                                        ) {
                                            const target = targetAt(
                                                grid.current,
                                                event.clientX,
                                                event.clientY,
                                            );
                                            if (target) {
                                                move(agent.id, target);
                                            }
                                        }
                                    }}
                                    onPointerCancel={endDrag}
                                    onLostPointerCapture={endDrag}
                                    onKeyDown={(event) => {
                                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                            event.preventDefault();
                                            const target =
                                                data.agents[
                                                    index + (event.key === "ArrowUp" ? -1 : 1)
                                                ];
                                            if (target) {
                                                move(agent.id, {
                                                    id: target.id,
                                                    side:
                                                        event.key === "ArrowUp"
                                                            ? "before"
                                                            : "after",
                                                });
                                            }
                                        }
                                    }}
                                >
                                    <GripVertical size={16} />
                                </button>
                                <AgentIcon id={agent.id} />
                                <h3>{agent.name}</h3>
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
