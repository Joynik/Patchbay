import { Moon, Sun, Type } from "lucide-react";

import type { Action, Snapshot, TextSize } from "../app/api";
import { Select } from "../components/ui/Select";
import { languages, type Messages } from "../i18n";
import { Agents } from "./Agents";

const languageOptions = Object.entries(languages);
const textSizes: TextSize[] = ["small", "default", "large"];
const themes = [
    ["light", Sun],
    ["dark", Moon],
] as const;

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
        <div className="stack">
            <section className="panel preferences">
                <div className="preference-row">
                    <div>
                        <h2 id="appearance">{t.theme}</h2>
                        <p className="muted text-sm">{t.themeHint}</p>
                    </div>
                    <div className="segments" role="radiogroup" aria-labelledby="appearance">
                        {themes.map(([theme, Icon]) => (
                            <label key={theme}>
                                <input
                                    className="sr-only"
                                    name="appearance"
                                    type="radio"
                                    checked={theme === data.theme}
                                    disabled={busy}
                                    onChange={() =>
                                        void act({ type: "settings", theme, locale: data.locale })
                                    }
                                />
                                <span>
                                    <Icon size={15} aria-hidden="true" />
                                    {t[theme]}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="preference-row">
                    <div>
                        <h2 id="text-size">{t.textSize}</h2>
                        <p className="muted text-sm">{t.textSizeHint}</p>
                    </div>
                    <div className="segments" role="radiogroup" aria-labelledby="text-size">
                        {textSizes.map((size) => (
                            <label key={size}>
                                <input
                                    className="sr-only"
                                    name="text-size"
                                    type="radio"
                                    checked={size === data.text_size}
                                    disabled={busy}
                                    onChange={() => void act({ type: "text_size", size })}
                                />
                                <span>
                                    <Type size={15} aria-hidden="true" />
                                    {t[size]}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="preference-row">
                    <div>
                        <label htmlFor="language">{t.language}</label>
                        <p className="muted text-sm">{t.languageHint}</p>
                    </div>
                    <Select
                        id="language"
                        value={data.locale}
                        options={languageOptions}
                        disabled={busy}
                        onChange={(locale) =>
                            void act({ type: "settings", theme: data.theme, locale })
                        }
                    />
                </div>
            </section>
            <section className="stack" aria-labelledby="settings-agents">
                <h2 id="settings-agents">{t.agents}</h2>
                <Agents data={data} t={t} act={act} busy={busy} />
            </section>
        </div>
    );
}
