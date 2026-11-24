import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

export function Modal({
    title,
    open,
    setOpen,
    children,
    closeLabel,
    wide = false,
}: {
    title: string;
    open: boolean;
    setOpen: (open: boolean) => void;
    children: ReactNode;
    closeLabel: string;
    wide?: boolean;
}) {
    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="overlay" />
                <Dialog.Content
                    className={wide ? "modal modal-wide" : "modal"}
                    aria-describedby={undefined}
                >
                    <div className="flex items-center justify-between gap-4">
                        <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
                        <Dialog.Close className="icon-button" aria-label={closeLabel}>
                            <X size={18} />
                        </Dialog.Close>
                    </div>
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
