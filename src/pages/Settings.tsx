import type { Action, Snapshot } from "../app/api";
import { languages, type Messages } from "../i18n";

export function Settings({
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
    return (
        <section className="panel preferences">
            <label>
                {t.theme}
                <select
                    value={data.theme}
                    disabled={busy}
                    onChange={(event) =>
                        void act({
                            type: "settings",
                            theme: event.target.value,
                            locale: data.locale,
                        })
                    }
                >
                    <option value="dark">{t.dark}</option>
                    <option value="light">{t.light}</option>
                </select>
            </label>
            <label>
                {t.language}
                <select
                    value={data.locale}
                    disabled={busy}
                    onChange={(event) =>
                        void act({
                            type: "settings",
                            theme: data.theme,
                            locale: event.target.value,
                        })
                    }
                >
                    {Object.entries(languages).map(([id, name]) => (
                        <option key={id} value={id}>
                            {name}
                        </option>
                    ))}
                </select>
            </label>
        </section>
    );
}
