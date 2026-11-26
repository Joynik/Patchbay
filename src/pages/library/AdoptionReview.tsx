import { useState } from "react";

import type { Connection, Server } from "../../app/api";
import { Modal } from "../../components/ui/Modal";
import type { Messages } from "../../i18n";

export type AdoptionOption = {
    connection: Connection;
    agents: { id: string; name: string }[];
};

export function sameConnection(first: Connection, second: Connection) {
    if (first.type === "http") {
        return second.type === "http" && first.url === second.url;
    }
    return (
        second.type === "stdio" &&
        first.command === second.command &&
        first.args.length === second.args.length &&
        first.args.every((argument, index) => argument === second.args[index])
    );
}

export function AdoptionReview({
    serverKey,
    existing,
    options,
    busy,
    t,
    close,
    adopt,
    editServer,
}: {
    serverKey: string;
    existing?: Server;
    options: AdoptionOption[];
    busy: boolean;
    t: Messages;
    close: () => void;
    adopt: (option: AdoptionOption) => void;
    editServer: (server: Server) => void;
}) {
    const [selected, setSelected] = useState(
        options.findIndex(
            ({ connection }) => !existing || sameConnection(existing.connection, connection),
        ),
    );

    return (
        <Modal
            wide
            open
            setOpen={(open) => {
                if (!open) {
                    close();
                }
            }}
            title={`${t.compareConnections} · ${serverKey}`}
            closeLabel={t.close}
        >
            <div className="stack mt-4">
                <p className="muted">{existing ? t.adoptionExisting : t.adoptionChoose}</p>
                {existing && (
                    <section className="panel">
                        <h3 className="font-semibold">{t.managedServers}</h3>
                        <pre className="mt-2 whitespace-pre-wrap break-all">
                            {JSON.stringify(existing.connection, null, 2)}
                        </pre>
                    </section>
                )}
                <div className="stack" role="radiogroup" aria-label={t.compareConnections}>
                    {options.map(({ connection, agents }, index) => {
                        const agentNames = agents.map(({ name }) => name).join(", ");
                        const available =
                            !existing || sameConnection(existing.connection, connection);
                        return (
                            <label className="panel stack" key={agents[0].id}>
                                <span className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="adoption-connection"
                                        aria-label={agentNames}
                                        checked={selected === index}
                                        disabled={busy || !available}
                                        onChange={() => setSelected(index)}
                                    />
                                    <span>{agentNames}</span>
                                </span>
                                <code className="block whitespace-pre-wrap break-all">
                                    {JSON.stringify(connection, null, 2)}
                                </code>
                            </label>
                        );
                    })}
                </div>
                <div className="actions flex-wrap">
                    <button className="button" type="button" onClick={close}>
                        {t.cancel}
                    </button>
                    {existing && (
                        <button
                            className="button"
                            type="button"
                            disabled={busy}
                            onClick={() => editServer(existing)}
                        >
                            {t.edit}
                        </button>
                    )}
                    <button
                        className="button primary"
                        type="button"
                        disabled={busy || selected < 0}
                        onClick={() => adopt(options[selected])}
                    >
                        {t.manage}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
