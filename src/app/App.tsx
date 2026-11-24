import {
    LayoutDashboard,
    LibraryBig,
    PlugZap,
    RefreshCw,
    Settings2,
    Waypoints,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { labels } from "../i18n";
import { Agents } from "../pages/Agents";
import { Dashboard } from "../pages/Dashboard";
import { Library } from "../pages/Library";
import { Settings } from "../pages/Settings";
import { type Action, change, load, type Snapshot } from "./api";

const pages = {
    dashboard: LayoutDashboard,
    library: LibraryBig,
    agents: PlugZap,
    settings: Settings2,
};
type Page = keyof typeof pages;

export function App() {
    const [page, setPage] = useState<Page>("dashboard");
    const [data, setData] = useState<Snapshot>();
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const inFlight = useRef(true);
    const t = labels(data?.locale ?? "en");

    async function perform(action?: Action) {
        if (inFlight.current) {
            return false;
        }
        inFlight.current = true;
        setBusy(true);
        setError("");
        try {
            const snapshot = await (action ? change(action) : load());
            setData(snapshot);
            return (
                action?.type !== "remove" ||
                !snapshot.servers.some((server) => server.id === action.server)
            );
        } catch (cause) {
            setError(String(cause));
            return false;
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    }

    useEffect(() => {
        void load()
            .then(setData)
            .catch((cause: unknown) => setError(String(cause)))
            .finally(() => {
                inFlight.current = false;
                setBusy(false);
            });
    }, []);
    useEffect(() => {
        document.documentElement.dataset.theme = data?.theme ?? "dark";
        document.documentElement.dataset.textSize = data?.text_size ?? "default";
        document.documentElement.lang = data?.locale ?? "en";
    }, [data?.theme, data?.locale, data?.text_size]);

    return (
        <div className="shell">
            <aside>
                <div className="wordmark">
                    <Waypoints size={23} /> Patchbay
                </div>
                <nav className="navigation">
                    {Object.entries(pages).map(([key, Icon]) => (
                        <button
                            key={key}
                            className={key === "settings" ? "navigation-settings" : undefined}
                            aria-current={page === key ? "page" : undefined}
                            onClick={() => setPage(key as Page)}
                        >
                            <Icon size={18} />
                            <span>{t[key as Page]}</span>
                        </button>
                    ))}
                </nav>
            </aside>
            <main>
                <header className="page-header">
                    <h1>{t[page]}</h1>
                    <button className="button" disabled={busy} onClick={() => void perform()}>
                        <RefreshCw size={15} />
                        {t.refresh}
                    </button>
                </header>
                {error && (
                    <p role="alert" className="panel error mb-4">
                        {error}
                    </p>
                )}
                {data && data.issues.length > 0 && (
                    <section className="panel error mb-4" role="alert">
                        <h2>{t.issues}</h2>
                        <ul className="mb-3">
                            {data.issues.map((issue) => (
                                <li key={`${issue.agent}/${issue.server}`}>
                                    {data.agents.find((agent) => agent.id === issue.agent)?.name} ·{" "}
                                    {
                                        data.servers.find((server) => server.id === issue.server)
                                            ?.name
                                    }{" "}
                                    — {issue.message}
                                </li>
                            ))}
                        </ul>
                        <button
                            className="button"
                            disabled={busy}
                            onClick={() => void perform({ type: "retry" })}
                        >
                            {t.retry}
                        </button>
                    </section>
                )}
                {!data && !error && <output className="muted">{t.loading}</output>}
                {data && page === "dashboard" && <Dashboard data={data} t={t} />}
                {data && page === "library" && (
                    <Library data={data} t={t} act={perform} busy={busy} />
                )}
                {data && page === "agents" && (
                    <Agents data={data} t={t} act={perform} busy={busy} />
                )}
                {data && page === "settings" && (
                    <Settings data={data} t={t} act={perform} busy={busy} />
                )}
            </main>
        </div>
    );
}
