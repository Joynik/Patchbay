import { Check, ChevronDown } from "lucide-react";
import { Select as Primitive } from "radix-ui";

export function Select({
    id,
    value,
    options,
    disabled,
    onChange,
}: {
    id: string;
    value: string;
    options: [value: string, label: string][];
    disabled?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <Primitive.Root value={value} onValueChange={onChange} disabled={disabled}>
            <Primitive.Trigger id={id} className="select-trigger">
                <Primitive.Value />
                <Primitive.Icon asChild>
                    <ChevronDown size={16} />
                </Primitive.Icon>
            </Primitive.Trigger>
            <Primitive.Portal>
                <Primitive.Content position="popper" sideOffset={5} className="select-menu">
                    <Primitive.Viewport>
                        <Primitive.Group>
                            {options.map(([key, label]) => (
                                <Primitive.Item key={key} value={key} className="select-option">
                                    <Primitive.ItemText>{label}</Primitive.ItemText>
                                    <Primitive.ItemIndicator>
                                        <Check size={15} />
                                    </Primitive.ItemIndicator>
                                </Primitive.Item>
                            ))}
                        </Primitive.Group>
                    </Primitive.Viewport>
                </Primitive.Content>
            </Primitive.Portal>
        </Primitive.Root>
    );
}
