import {
    Children,
    createContext,
    isValidElement,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ComponentProps,
    type CSSProperties,
    type ReactNode,
    type Ref,
} from 'react';
import { cx } from './kit';
import { Icon } from './icons';

// Form controls in the app's kit: Field (label + error), Input, TextArea,
// Select (native, or a searchable combobox) and MultiSelect. Controls follow
// the Notion tokens: 8px radius, hairline-strong border, saffron focus ring,
// and 44px height on touch viewports.

// ----------------------------------------------------------------- Field

const FieldContext = createContext<{ id: string; invalid: boolean } | null>(null);

// A labelled control. The label is wired to the control through context so a
// plain <Input>/<Select> inside it picks up the id automatically.
export function Field({
    label,
    required = false,
    error,
    help,
    className,
    children,
}: {
    label?: ReactNode;
    required?: boolean;
    error?: ReactNode;
    help?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const id = useId();
    return (
        <FieldContext.Provider value={{ id, invalid: Boolean(error) }}>
            <div className={cx('mb-3 grid gap-1', className)}>
                {label && (
                    <label htmlFor={id} className="text-sm font-medium text-charcoal">
                        {required && (
                            <span aria-hidden="true" className="mr-1 text-error-text">
                                *
                            </span>
                        )}
                        {label}
                    </label>
                )}
                {children}
                {error ? (
                    <div role="alert" className="text-sm text-error-text">
                        {error}
                    </div>
                ) : (
                    help && <div className="text-sm text-steel">{help}</div>
                )}
            </div>
        </FieldContext.Provider>
    );
}

// --------------------------------------------------------------- Control

type ControlSize = 'small' | 'middle' | 'large';

const CONTROL_SIZES: Record<ControlSize, string> = {
    small: 'min-h-7 text-[13px] max-md:min-h-10',
    middle: 'min-h-9 text-sm max-md:min-h-11 max-md:text-base',
    large: 'min-h-11 text-base',
};

const CONTROL_BASE =
    'w-full rounded-lg border bg-surface px-3 text-ink transition-colors outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-70';

function controlBorder(invalid: boolean) {
    return invalid
        ? 'border-error focus-within:ring-1 focus-within:ring-error'
        : 'border-line-strong focus-within:border-accent focus-within:ring-1 focus-within:ring-accent';
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
    return (instance: T | null) => {
        for (const ref of refs) {
            if (typeof ref === 'function') ref(instance);
            else if (ref) (ref as { current: T | null }).current = instance;
        }
    };
}

// -------------------------------------------------------------- Input

export function Input({
    size = 'middle',
    allowClear = false,
    prefix,
    onPressEnter,
    invalid,
    className,
    ref,
    ...rest
}: Omit<ComponentProps<'input'>, 'size' | 'prefix'> & {
    size?: ControlSize;
    allowClear?: boolean;
    prefix?: ReactNode;
    onPressEnter?: () => void;
    invalid?: boolean;
}) {
    const field = useContext(FieldContext);
    const innerRef = useRef<HTMLInputElement>(null);
    const hasValue = rest.value !== undefined && String(rest.value) !== '';
    const clear = () => {
        const input = innerRef.current;
        if (!input) return;
        // Go through the native setter so React's controlled onChange fires.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    };
    return (
        <span
            className={cx(
                'ui-input inline-flex items-center gap-2',
                CONTROL_BASE,
                CONTROL_SIZES[size],
                controlBorder(Boolean(invalid ?? field?.invalid)),
                className,
            )}>
            {prefix && <span className="shrink-0 text-steel">{prefix}</span>}
            <input
                id={field?.id}
                aria-invalid={(invalid ?? field?.invalid) ? true : undefined}
                {...rest}
                ref={mergeRefs(innerRef, ref)}
                onKeyDown={(event) => {
                    rest.onKeyDown?.(event);
                    if (event.key === 'Enter' && onPressEnter && !event.nativeEvent.isComposing) {
                        onPressEnter();
                    }
                }}
                className="min-w-0 flex-1 bg-transparent py-1 outline-none disabled:cursor-not-allowed"
            />
            {allowClear && hasValue && !rest.disabled && (
                <button
                    type="button"
                    aria-label="Clear"
                    onClick={clear}
                    className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-steel hover:bg-ink/5">
                    <Icon name="close" className="size-3" />
                </button>
            )}
        </span>
    );
}

export function TextArea({
    size = 'middle',
    autoSize,
    className,
    ref,
    ...rest
}: Omit<ComponentProps<'textarea'>, 'size'> & {
    size?: ControlSize;
    autoSize?: { minRows?: number; maxRows?: number };
}) {
    const field = useContext(FieldContext);
    const innerRef = useRef<HTMLTextAreaElement>(null);
    // Grow with the content between minRows and maxRows.
    useLayoutEffect(() => {
        const element = innerRef.current;
        if (!element || !autoSize) return;
        element.style.height = 'auto';
        const line = parseFloat(getComputedStyle(element).lineHeight) || 20;
        const padding = element.offsetHeight - element.clientHeight + 12;
        const min = (autoSize.minRows ?? 1) * line + padding;
        const max = (autoSize.maxRows ?? Infinity) * line + padding;
        element.style.height = `${Math.min(Math.max(element.scrollHeight, min), max)}px`;
    }, [autoSize, rest.value]);
    return (
        <textarea
            id={field?.id}
            rows={autoSize ? (autoSize.minRows ?? 1) : undefined}
            {...rest}
            ref={mergeRefs(innerRef, ref)}
            className={cx(
                CONTROL_BASE,
                CONTROL_SIZES[size],
                'block resize-y py-1.5',
                controlBorder(Boolean(field?.invalid)),
                'focus:border-accent focus:ring-1 focus:ring-accent',
                className,
            )}
        />
    );
}

// ------------------------------------------------------------- Select

export interface SelectOption {
    value: string;
    label: ReactNode;
    disabled?: boolean;
}

// <Select.Option value="x">Label</Select.Option> children are read as data.
function SelectOptionMarker(_props: { value: string; disabled?: boolean; children?: ReactNode }) {
    return null;
}

function optionsFromChildren(children: ReactNode): SelectOption[] {
    return Children.toArray(children)
        .filter(isValidElement)
        .map((element) => {
            const props = element.props as {
                value: string;
                disabled?: boolean;
                children?: ReactNode;
            };
            return { value: props.value, label: props.children, disabled: props.disabled };
        });
}

function textOf(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
    return '';
}

interface SelectProps {
    value?: string | null;
    // Method syntax so callers may narrow `value` (e.g. to a string union).
    onChange?(value: string): void;
    onBlur?: () => void;
    options?: SelectOption[];
    children?: ReactNode;
    placeholder?: string;
    showSearch?: boolean;
    disabled?: boolean;
    loading?: boolean;
    status?: 'error';
    name?: string;
    className?: string;
    size?: ControlSize;
    'aria-label'?: string;
    ref?: Ref<HTMLSelectElement>;
}

// A disabled empty option ("Select a department") is a placeholder, not a choice.
const isPlaceholderOption = (option: SelectOption) => option.value === '' && option.disabled;

// Lists longer than this are searchable by default; shorter ones are a native
// select, which is quicker to use (and nicer on phones) when everything fits.
export const SEARCHABLE_SELECT_MIN_OPTIONS = 7;

// Type-to-filter is the default for long lists, so nobody has to scroll a big
// dropdown. Pass showSearch={false} to force a native select anyway.
export function Select(props: SelectProps) {
    const options = props.options ?? optionsFromChildren(props.children);
    const searchable =
        props.showSearch ??
        options.filter((option) => !isPlaceholderOption(option)).length >=
            SEARCHABLE_SELECT_MIN_OPTIONS;
    return searchable ? (
        <Combobox {...props} options={options} />
    ) : (
        <NativeSelect {...props} options={options} />
    );
}
Select.Option = SelectOptionMarker;

function NativeSelect({
    value,
    onChange,
    onBlur,
    options = [],
    placeholder,
    disabled,
    status,
    name,
    className,
    size = 'middle',
    'aria-label': ariaLabel,
    ref,
}: SelectProps) {
    const field = useContext(FieldContext);
    const invalid = status === 'error' || Boolean(field?.invalid);
    const current = value ?? '';
    // An unset value shows the placeholder, unless a real "" option exists.
    const needsPlaceholder = !options.some((option) => option.value === '');
    return (
        <span className={cx('relative inline-block max-w-full min-w-0', className)}>
            <select
                id={field?.id}
                ref={ref}
                name={name}
                value={current}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                onChange={(event) => onChange?.(event.target.value)}
                onBlur={onBlur}
                className={cx(
                    CONTROL_BASE,
                    CONTROL_SIZES[size],
                    'cursor-pointer appearance-none truncate pr-9',
                    invalid
                        ? 'border-error focus:ring-1 focus:ring-error'
                        : 'border-line-strong focus:border-accent focus:ring-1 focus:ring-accent',
                    current === '' && placeholder && 'text-placeholder',
                )}>
                {needsPlaceholder && (
                    <option value="" disabled hidden>
                        {placeholder ?? ''}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                        {textOf(option.label)}
                    </option>
                ))}
            </select>
            <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-steel"
            />
        </span>
    );
}

// Closes a popup on outside click or Escape.
export function useDismiss(
    ref: React.RefObject<HTMLElement | null>,
    open: boolean,
    close: () => void,
) {
    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [ref, open, close]);
}

// Positions a popup with `position: fixed`, computed from its trigger, so a
// scrolling ancestor (a modal body, a table wrapper) can never clip it. It
// opens below the trigger, or above when there is more room there, and its
// height is capped to the room available so the list scrolls instead of
// running off screen. Re-measured on scroll and resize while open.
export function useFloatingStyle(
    anchorRef: React.RefObject<HTMLElement | null>,
    open: boolean,
    {
        align = 'start',
        placement = 'auto',
        maxHeight = 256,
        matchWidth = false,
    }: {
        align?: 'start' | 'end';
        placement?: 'auto' | 'top' | 'bottom';
        maxHeight?: number;
        matchWidth?: boolean;
    } = {},
): CSSProperties | undefined {
    const [style, setStyle] = useState<CSSProperties>();
    useLayoutEffect(() => {
        if (!open) {
            setStyle(undefined);
            return;
        }
        const update = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const gap = 4;
            const margin = 8;
            const below = window.innerHeight - rect.bottom - gap - margin;
            const above = rect.top - gap - margin;
            const preferTop =
                placement === 'top' || (placement === 'auto' && below < 160 && above > below);
            const room = Math.max(preferTop ? above : below, 96);
            setStyle({
                position: 'fixed',
                ...(align === 'end'
                    ? { right: Math.max(window.innerWidth - rect.right, margin) }
                    : { left: Math.max(rect.left, margin) }),
                ...(preferTop
                    ? { bottom: window.innerHeight - rect.top + gap }
                    : { top: rect.bottom + gap }),
                ...(matchWidth ? { minWidth: rect.width } : {}),
                maxHeight: Math.min(maxHeight, room),
            });
        };
        update();
        // Layout can still settle after the first measure (a centred modal
        // re-centres once the popup leaves the flow), so measure once more.
        const frame = requestAnimationFrame(update);
        window.addEventListener('resize', update);
        // Capture phase, so scrolling any ancestor re-anchors the popup.
        window.addEventListener('scroll', update, true);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [anchorRef, open, align, placement, maxHeight, matchWidth]);
    // Before the first measure the popup is already out of the flow (and
    // hidden), so it cannot stretch its container and skew that measurement.
    return open ? (style ?? UNMEASURED) : undefined;
}

const UNMEASURED: CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

const POPUP =
    'z-50 max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border border-line bg-surface py-1 shadow-overlay';

// Searchable single select (WAI-ARIA combobox with a listbox popup).
function Combobox({
    value,
    onChange,
    onBlur,
    options = [],
    placeholder,
    disabled,
    status,
    className,
    size = 'middle',
    'aria-label': ariaLabel,
}: SelectProps) {
    const field = useContext(FieldContext);
    const invalid = status === 'error' || Boolean(field?.invalid);
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const listId = useId();
    const choices = options.filter((option) => !isPlaceholderOption(option));
    const selected = choices.find((option) => option.value === value);
    // With nothing chosen, a placeholder option's label is the placeholder text.
    const hint = placeholder ?? textOf(options.find(isPlaceholderOption)?.label);
    const needle = query.trim().toLowerCase();
    const visible = needle
        ? choices.filter((option) => textOf(option.label).toLowerCase().includes(needle))
        : choices;
    const close = () => {
        setOpen(false);
        setQuery('');
        onBlur?.();
    };
    useDismiss(rootRef, open, close);
    const popupStyle = useFloatingStyle(rootRef, open, { matchWidth: true });
    const choose = (option: SelectOption | undefined) => {
        if (!option || option.disabled) return;
        onChange?.(option.value);
        setOpen(false);
        setQuery('');
    };
    return (
        <div ref={rootRef} className={cx('relative inline-block max-w-full min-w-0', className)}>
            <input
                id={field?.id}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                autoComplete="off"
                disabled={disabled}
                placeholder={selected ? textOf(selected.label) : hint}
                value={open ? query : selected ? textOf(selected.label) : ''}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                    setOpen(true);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setOpen(true);
                        setActive((index) => Math.min(index + 1, visible.length - 1));
                    } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setActive((index) => Math.max(index - 1, 0));
                    } else if (event.key === 'Enter' && open) {
                        event.preventDefault();
                        choose(visible[active]);
                    } else if (event.key === 'Tab') {
                        close();
                    }
                }}
                className={cx(
                    CONTROL_BASE,
                    CONTROL_SIZES[size],
                    'pr-9',
                    selected && !open && 'placeholder:text-ink',
                    invalid
                        ? 'border-error focus:ring-1 focus:ring-error'
                        : 'border-line-strong focus:border-accent focus:ring-1 focus:ring-accent',
                )}
            />
            <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-steel"
            />
            {open && (
                <ul id={listId} role="listbox" className={POPUP} style={popupStyle}>
                    {visible.length === 0 && (
                        <li className="px-3 py-2 text-sm text-steel">No matches</li>
                    )}
                    {visible.map((option, index) => (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={option.value === value}
                            aria-disabled={option.disabled || undefined}
                            // mousedown (not click) keeps focus in the input.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                choose(option);
                            }}
                            onMouseEnter={() => setActive(index)}
                            className={cx(
                                'cursor-pointer px-3 py-2 text-sm',
                                index === active && 'bg-ink/5',
                                option.value === value && 'font-semibold',
                                option.disabled && 'cursor-not-allowed opacity-50',
                            )}>
                            {option.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Multi-select: a button that opens a checkbox list.
export function MultiSelect({
    value,
    onChange,
    options,
    placeholder = 'Select',
    optionRender,
    renderValue,
    className,
    'aria-label': ariaLabel,
}: {
    value: string[];
    onChange: (value: string[]) => void;
    options: SelectOption[];
    placeholder?: string;
    optionRender?: (option: SelectOption) => ReactNode;
    // Replaces the default "label, label" summary shown on the button.
    renderValue?: (selected: SelectOption[]) => ReactNode;
    className?: string;
    'aria-label'?: string;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    useDismiss(rootRef, open, () => setOpen(false));
    const popupStyle = useFloatingStyle(rootRef, open, { matchWidth: true });
    const selected = options.filter((option) => value.includes(option.value));
    return (
        <div ref={rootRef} className={cx('relative inline-block max-w-full min-w-0', className)}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => setOpen((current) => !current)}
                className={cx(
                    CONTROL_BASE,
                    CONTROL_SIZES.middle,
                    'flex cursor-pointer items-center gap-2 border-line-strong pr-9 text-left focus:border-accent focus:ring-1 focus:ring-accent',
                )}>
                <span className={cx('truncate', selected.length === 0 && 'text-placeholder')}>
                    {selected.length === 0
                        ? placeholder
                        : renderValue
                          ? renderValue(selected)
                          : selected.map((option) => textOf(option.label)).join(', ')}
                </span>
            </button>
            <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-steel"
            />
            {open && (
                <div
                    role="listbox"
                    aria-multiselectable="true"
                    className={POPUP}
                    style={popupStyle}>
                    {options.map((option) => (
                        <label
                            key={option.value}
                            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-ink/5">
                            <input
                                type="checkbox"
                                checked={value.includes(option.value)}
                                disabled={option.disabled}
                                onChange={(event) =>
                                    onChange(
                                        event.target.checked
                                            ? [...value, option.value]
                                            : value.filter((entry) => entry !== option.value),
                                    )
                                }
                                className="size-4 accent-accent"
                            />
                            <span className="flex-1">
                                {optionRender ? optionRender(option) : option.label}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
