import { Plug } from "lucide-react";

const assets = import.meta.glob<string>("../../assets/agents/*/{light,dark}/icon.{png,svg,webp}", {
    eager: true,
    import: "default",
    query: "?url&no-inline",
});

function iconFor(id: string, theme: "light" | "dark") {
    const base = `../../assets/agents/${id}/${theme}/icon`;
    return assets[`${base}.svg`] ?? assets[`${base}.png`] ?? assets[`${base}.webp`];
}

export function AgentIcon({ id }: { id: string }) {
    const dark = iconFor(id, "dark");
    const light = iconFor(id, "light");
    return (
        <span className="agent-icon" aria-hidden="true">
            {dark && light ? (
                <>
                    <img src={dark} data-icon-theme="dark" alt="" draggable={false} />
                    <img src={light} data-icon-theme="light" alt="" draggable={false} />
                </>
            ) : dark || light ? (
                <img src={dark ?? light} alt="" draggable={false} />
            ) : (
                <Plug size={16} />
            )}
        </span>
    );
}
