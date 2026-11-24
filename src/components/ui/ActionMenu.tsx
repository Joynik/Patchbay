import { Ellipsis } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";

export function ActionMenu({
    label,
    disabled,
    children,
}: {
    label: string;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger
                className="icon-button"
                title={label}
                aria-label={label}
                disabled={disabled}
            >
                <Ellipsis size={18} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={5}
                    className="select-menu action-menu"
                >
                    <DropdownMenu.Group>{children}</DropdownMenu.Group>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
