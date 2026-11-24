import { Plug } from "lucide-react";

import antigravity from "../../assets/agents/antigravity.svg?no-inline";
import claudeCode from "../../assets/agents/claude-code.png?no-inline";
import claudeDesktop from "../../assets/agents/claude-desktop.png?no-inline";
import codex from "../../assets/agents/codex.png?no-inline";
import opencodeDark from "../../assets/agents/opencode-dark.svg?no-inline";
import opencodeLight from "../../assets/agents/opencode-light.svg?no-inline";
import pi from "../../assets/agents/pi.svg?no-inline";

const icons = {
    codex,
    claude_code: claudeCode,
    claude_desktop: claudeDesktop,
    pi,
    antigravity,
    opencode: opencodeDark,
};

export function AgentIcon({ id }: { id: string }) {
    const icon = icons[id as keyof typeof icons];
    return (
        <span className="agent-icon" aria-hidden="true">
            {icon ? <img src={icon} alt="" draggable={false} /> : <Plug size={16} />}
            {id === "opencode" && (
                <img className="agent-icon-light" src={opencodeLight} alt="" draggable={false} />
            )}
        </span>
    );
}
