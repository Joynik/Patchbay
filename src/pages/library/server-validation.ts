export const serverNamePattern = "[A-Za-z0-9_\\-]+";
const serverName = new RegExp(`^${serverNamePattern}$`);

export function validServerName(name: string) {
    return name === name.trim() && serverName.test(name);
}

function hasControlCharacters(value: string) {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || (code >= 127 && code <= 159);
    });
}

export function validCommand(command: string) {
    if (!command || command !== command.trim() || hasControlCharacters(command)) {
        return false;
    }
    if (/^(\/|\.\.?\/)/.test(command)) {
        return !command.endsWith("/");
    }
    return /^[A-Za-z0-9_.+@-]+$/.test(command) && command !== "." && command !== "..";
}

export function validArgument(argument: string) {
    return Boolean(argument.trim()) && !hasControlCharacters(argument);
}

export function parseArguments(input: string) {
    return input ? input.replace(/\r?\n$/, "").split(/\r?\n/) : [];
}
