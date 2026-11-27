import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './icons';
import { dropIndex, moveItem, type SlotRect } from './sortable';

// The app's small UI kit: the handful of primitives every screen shares,
// styled with Tailwind utilities against the theme tokens in input.css
// (Notion-inspired: 8px rectangular controls, 12px hairline cards, tinted
// tag chips). Props deliberately follow the names the screens already used
// so call sites stay readable.

export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export function Spinner({ className }: { className?: string }) {
    return (
        <span
            role="status"
            aria-label="Loading"
            className={cx(
                'inline-block size-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
                className,
            )}
        />
    );
}

// ---------------------------------------------------------------- Button

type ButtonType = 'primary' | 'default' | 'text' | 'link';

const BUTTON_BASE =
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const BUTTON_TYPES: Record<ButtonType, { normal: string; danger: string }> = {
    primary: {
        normal: 'border-accent bg-accent text-accent-content hover:border-accent-hover hover:bg-accent-hover',
        danger: 'border-error bg-error text-white hover:border-error-hover hover:bg-error-hover',
    },
    default: {
        normal: 'border-line-strong bg-surface text-ink hover:border-accent hover:text-accent',
        danger: 'border-error-border bg-surface text-error-text hover:border-error hover:bg-error-bg',
    },
    text: {
        normal: 'border-transparent bg-transparent text-ink hover:bg-ink/5',
        danger: 'border-transparent bg-transparent text-error-text hover:bg-error-bg',
    },
    link: {
        normal: 'border-transparent bg-transparent px-0 text-link hover:underline',
        danger: 'border-transparent bg-transparent px-0 text-error-text hover:underline',
    },
};

// Tinted buttons in the status badges' colours, so an action (approve, reject,
// cancel...) reads like the status it leads to.
export type ButtonTone = 'green' | 'red' | 'blue' | 'default';
const BUTTON_TONES: Record<ButtonTone, string> = {
    green: 'border-tag-green-text/30 bg-tag-green text-tag-green-text hover:border-tag-green-text hover:bg-tag-green-hover',
    red: 'border-error/30 bg-error-bg text-error-text hover:border-error hover:bg-error-bg-hover',
    blue: 'border-tag-blue-text/30 bg-tag-blue text-tag-blue-text hover:border-tag-blue-text hover:bg-tag-blue-hover',
    default:
        'border-charcoal/20 bg-tag-neutral text-charcoal hover:border-charcoal hover:bg-tag-neutral-hover',
};

// Icon-only primary buttons (search, add, delete) are tinted instead of solid so
// a row of them stays light; buttons with a text label keep the solid fill.
const SOFT_PRIMARY = {
    normal: 'border-accent/30 bg-accent/10 text-accent hover:border-accent hover:bg-accent/20',
    danger: 'border-error/30 bg-error/10 text-error hover:border-error hover:bg-error/20',
};

// Desktop controls are 32px; touch controls are 44px (see the Notion tokens).
// `small` stays compact on every viewport.
const BUTTON_SIZES = {
    middle: 'h-8 px-3.5 text-sm max-md:h-11 max-md:px-4 max-md:text-base',
    // Small stays compact but never below a comfortable touch target on mobile.
    small: 'h-7 px-2.5 text-[13px] max-md:min-h-10 max-md:min-w-10',
} as const;

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
    type?: ButtonType;
    htmlType?: 'button' | 'submit' | 'reset';
    danger?: boolean;
    // Overrides the type's colours with a status-badge tint.
    tone?: ButtonTone;
    size?: keyof typeof BUTTON_SIZES;
    loading?: boolean;
    icon?: ReactNode;
    block?: boolean;
    // Renders a link styled as a button.
    href?: string;
};

export function Button({
    type = 'default',
    htmlType = 'button',
    danger = false,
    tone,
    size = 'middle',
    loading = false,
    icon,
    block = false,
    className,
    children,
    disabled,
    onClick,
    href,
    ...rest
}: ButtonProps) {
    const inactive = loading || disabled;
    const iconOnly = Boolean(icon || loading) && (children === undefined || children === null);
    const classes = cx(
        BUTTON_BASE,
        BUTTON_SIZES[size],
        tone
            ? BUTTON_TONES[tone]
            : type === 'primary' && iconOnly
              ? SOFT_PRIMARY[danger ? 'danger' : 'normal']
              : BUTTON_TYPES[type][danger ? 'danger' : 'normal'],
        iconOnly && 'aspect-square px-0',
        block && 'w-full',
        className,
    );
    if (href) {
        return (
            <a
                href={href}
                className={classes}
                onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}>
                {icon}
                {children}
            </a>
        );
    }
    return (
        <button
            {...rest}
            type={htmlType}
            // Loading and disabled buttons stay focusable but ignore clicks, and a
            // loading submit button must not submit the form a second time.
            aria-disabled={inactive || undefined}
            aria-busy={loading || undefined}
            onClick={(event) => {
                if (inactive) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }}
            className={classes}>
            {loading ? <Spinner /> : icon}
            {children}
        </button>
    );
}

// ------------------------------------------------------- SegmentedControl

// A short row of mutually exclusive choices that swap what the page shows
// (e.g. Programs / Inventory). Buttons rather than a dropdown, so every choice
// is visible and one tap away.
export function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
    className,
    ...rest
}: {
    value: T;
    options: Array<{ value: T; label: string; icon?: ReactNode }>;
    onChange: (value: T) => void;
    className?: string;
    'aria-label': string;
}) {
    return (
        <div
            role="group"
            aria-label={rest['aria-label']}
            className={cx(
                'inline-flex shrink-0 gap-0.5 rounded-lg border border-line-strong bg-tag-neutral p-0.5',
                className,
            )}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => !selected && onChange(option.value)}
                        className={cx(
                            'inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent max-md:h-10 max-md:px-4',
                            selected
                                ? 'bg-surface text-accent shadow-sm'
                                : 'text-ink hover:text-accent',
                        )}>
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

// ------------------------------------------------------------------ Tags

// Soft tinted chips (Notion's badge-tag-*), keyed by the semantic names the
// status helpers already return.
const TAG_COLORS = {
    default: 'bg-tag-neutral text-charcoal',
    blue: 'bg-tag-blue text-tag-blue-text',
    green: 'bg-tag-green text-tag-green-text',
    red: 'bg-error-bg text-error-text',
    orange: 'bg-tag-orange text-tag-orange-text',
    gold: 'bg-tag-gold text-tag-gold-text',
    purple: 'bg-tag-purple text-tag-purple-text',
} as const;

export type TagColor = keyof typeof TAG_COLORS;

export function Tag({
    color = 'default',
    className,
    style,
    closable = false,
    onClose,
    children,
}: {
    color?: string;
    className?: string;
    // For colours that come from data (e.g. a shift type's configured colour).
    style?: React.CSSProperties;
    closable?: boolean;
    onClose?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    children: ReactNode;
}) {
    return (
        <span
            className={cx(
                'inline-flex shrink-0 items-center rounded-md px-2 text-[13px] leading-5 font-semibold whitespace-nowrap',
                TAG_COLORS[color as TagColor] ?? TAG_COLORS.default,
                className,
            )}
            style={style}>
            {children}
            {closable && (
                <button
                    type="button"
                    aria-label="Remove"
                    onClick={onClose}
                    className="ml-1 -mr-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-sm hover:bg-ink/10">
                    <Icon name="close" className="size-3" />
                </button>
            )}
        </span>
    );
}

// A numeric pill (e.g. per-status counts beside a filter option).
export function CountBadge({
    count,
    showZero = false,
    overflowCount = 99,
}: {
    count: number;
    showZero?: boolean;
    overflowCount?: number;
}) {
    if (count === 0 && !showZero) return null;
    return (
        <span className="inline-block min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-semibold text-accent-content">
            {count > overflowCount ? `${overflowCount}+` : count}
        </span>
    );
}

// ------------------------------------------------------------ Typography

const TEXT_TYPES = {
    secondary: 'text-steel',
    danger: 'text-error',
    success: 'text-success',
    warning: 'text-warning',
} as const;

function TextSpan({
    type,
    strong = false,
    className,
    children,
}: {
    type?: keyof typeof TEXT_TYPES;
    strong?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <span className={cx(type && TEXT_TYPES[type], strong && 'font-semibold', className)}>
            {children}
        </span>
    );
}

function Paragraph({
    type,
    className,
    children,
}: {
    type?: keyof typeof TEXT_TYPES;
    className?: string;
    children?: ReactNode;
}) {
    return <p className={cx('mb-3', type && TEXT_TYPES[type], className)}>{children}</p>;
}

// Notion's heading scale, trimmed for an app UI. Margins are left to the
// caller's layout (flex gaps) rather than baked in.
const TITLE_LEVELS = {
    1: 'text-4xl leading-tight font-semibold tracking-tight',
    2: 'text-3xl leading-tight font-semibold tracking-tight max-md:text-2xl',
    3: 'text-xl leading-snug font-semibold',
    4: 'text-lg leading-snug font-semibold',
    5: 'text-base leading-snug font-semibold',
} as const;

function Title({
    level = 1,
    className,
    children,
}: {
    level?: keyof typeof TITLE_LEVELS;
    className?: string;
    children?: ReactNode;
}) {
    const Tag = `h${level}` as const;
    return <Tag className={cx('m-0', TITLE_LEVELS[level], className)}>{children}</Tag>;
}

export const Typography = { Text: TextSpan, Paragraph, Title };

// ----------------------------------------------------------------- Space

const SPACE_GAPS = { small: 'gap-2', middle: 'gap-4', large: 'gap-6' } as const;

// Flex row/column with a gap. Numeric sizes are pixels.
export function Space({
    direction = 'horizontal',
    size = 'small',
    wrap = false,
    className,
    children,
}: {
    direction?: 'horizontal' | 'vertical';
    size?: keyof typeof SPACE_GAPS | number;
    wrap?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div
            className={cx(
                'inline-flex',
                direction === 'vertical' ? 'flex-col' : 'items-center',
                wrap && 'flex-wrap',
                typeof size === 'string' && SPACE_GAPS[size],
                className,
            )}
            style={typeof size === 'number' ? { gap: size } : undefined}>
            {children}
        </div>
    );
}

export function Divider({ className }: { className?: string }) {
    return <hr className={cx('my-4 border-0 border-t border-line', className)} />;
}

// ------------------------------------------------------------------ Card

export function Card({
    title,
    extra,
    loading = false,
    className,
    children,
}: {
    title?: ReactNode;
    extra?: ReactNode;
    loading?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div className={cx('card rounded-xl border border-line bg-surface', className)}>
            {(title || extra) && (
                <div className="card-head flex min-h-14 items-center justify-between gap-3 border-b border-line px-6 text-base font-semibold">
                    <div className="min-w-0 flex-1 truncate">{title}</div>
                    {extra && <div className="shrink-0 text-sm font-normal">{extra}</div>}
                </div>
            )}
            <div className="card-body p-6">
                {loading ? (
                    <div className="grid animate-pulse gap-3" aria-label="Loading">
                        <div className="h-3 w-3/4 rounded bg-line" />
                        <div className="h-3 rounded bg-line" />
                        <div className="h-3 w-1/2 rounded bg-line" />
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------- Empty

export function Empty({
    description,
    children,
    className,
}: {
    description?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cx(
                'flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-steel',
                className,
            )}>
            <Icon name="inbox" className="size-10 text-line-strong" />
            <div>{description ?? children ?? 'No data'}</div>
        </div>
    );
}

// ---------------------------------------------------------------- Result

export function Result({
    title,
    subTitle,
    extra,
}: {
    status?: 'error' | 'info' | 'success';
    title: ReactNode;
    subTitle?: ReactNode;
    extra?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <h2 className="m-0 text-xl font-semibold">{title}</h2>
            {subTitle && <p className="m-0 max-w-prose text-steel">{subTitle}</p>}
            {extra && <div className="mt-3">{extra}</div>}
        </div>
    );
}

// ------------------------------------------------------------------ Misc

export function Checkbox({
    checked,
    defaultChecked,
    indeterminate,
    name,
    onChange,
    children,
}: {
    checked?: boolean;
    defaultChecked?: boolean;
    indeterminate?: boolean;
    name?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    children?: ReactNode;
}) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
                type="checkbox"
                name={name}
                checked={checked}
                defaultChecked={defaultChecked}
                onChange={onChange}
                ref={(element) => {
                    if (element) element.indeterminate = Boolean(indeterminate);
                }}
                className="size-4 cursor-pointer accent-accent"
            />
            {children}
        </label>
    );
}

// --------------------------------------------------------- SortableList

interface Drag {
    from: number;
    to: number;
    dy: number;
}

// A short list the person reorders by dragging a row's grip handle (mouse or
// touch), or with the up/down arrow keys while the handle has focus. Rows stay
// where they are in the DOM while dragging (the dragged one follows the pointer
// and the rows it passes make room), and `onChange` fires once on drop, so the
// pointer is never lost to a re-render. `items` are unique keys.
export function SortableList<T extends string>({
    items,
    onChange,
    renderItem,
    itemLabel,
    className,
}: {
    items: readonly T[];
    onChange: (next: T[]) => void;
    renderItem: (item: T) => ReactNode;
    itemLabel: (item: T) => string;
    className?: string;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const dragStart = useRef<{ y: number; rects: SlotRect[] } | null>(null);
    const focusItem = useRef<T | null>(null);
    const [drag, setDrag] = useState<Drag | null>(null);

    // A keyboard move re-orders the rows, which drops focus; put it back.
    useEffect(() => {
        if (focusItem.current === null) return;
        const handle = Array.from(
            listRef.current?.querySelectorAll<HTMLElement>('[data-handle]') ?? [],
        ).find((element) => element.dataset.handle === focusItem.current);
        focusItem.current = null;
        handle?.focus();
    });

    function start(event: React.PointerEvent<HTMLButtonElement>, index: number) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const rows = Array.from(listRef.current?.children ?? []);
        const rects = rows.map((row) => {
            const box = row.getBoundingClientRect();
            return { top: box.top, height: box.height };
        });
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = { y: event.clientY, rects };
        setDrag({ from: index, to: index, dy: 0 });
    }

    function move(event: React.PointerEvent<HTMLButtonElement>) {
        const begun = dragStart.current;
        if (!begun || !drag) return;
        const { rects } = begun;
        const first = rects[0];
        const last = rects[rects.length - 1];
        const own = rects[drag.from];
        // The dragged row stays inside the list.
        const dy = Math.max(
            first.top - own.top,
            Math.min(event.clientY - begun.y, last.top + last.height - (own.top + own.height)),
        );
        setDrag({ from: drag.from, to: dropIndex(rects, drag.from, dy), dy });
    }

    function drop(commit: boolean) {
        if (commit && drag && drag.to !== drag.from) onChange(moveItem(items, drag.from, drag.to));
        dragStart.current = null;
        setDrag(null);
    }

    function key(event: React.KeyboardEvent<HTMLButtonElement>, item: T, index: number) {
        if (event.key === 'Escape' && drag) return drop(false);
        const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        if (index + step < 0 || index + step >= items.length) return;
        focusItem.current = item;
        onChange(moveItem(items, index, index + step));
    }

    // How far the rows the dragged one passes move to make room for it.
    const rects = dragStart.current?.rects;
    const pitch =
        drag && rects
            ? rects[drag.from].height +
              (rects.length > 1 ? rects[1].top - (rects[0].top + rects[0].height) : 0)
            : 0;
    function offsetOf(index: number): number {
        if (!drag) return 0;
        if (index === drag.from) return drag.dy;
        if (drag.from < drag.to && index > drag.from && index <= drag.to) return -pitch;
        if (drag.from > drag.to && index >= drag.to && index < drag.from) return pitch;
        return 0;
    }

    return (
        <div ref={listRef} role="list" className={cx('grid gap-1', className)}>
            {items.map((item, index) => {
                const dragging = drag?.from === index;
                return (
                    <div
                        key={item}
                        role="listitem"
                        style={drag ? { transform: `translateY(${offsetOf(index)}px)` } : undefined}
                        className={cx(
                            'flex items-center gap-1 rounded-lg',
                            drag && !dragging && 'transition-transform duration-150',
                            dragging && 'relative z-10 bg-surface shadow-lg ring-1 ring-line',
                        )}>
                        <button
                            type="button"
                            data-handle={item}
                            aria-label={`Reorder ${itemLabel(item)}: drag, or press the up and down arrow keys`}
                            title="Drag to reorder"
                            onPointerDown={(event) => start(event, index)}
                            onPointerMove={move}
                            onPointerUp={() => drop(true)}
                            onPointerCancel={() => drop(false)}
                            onKeyDown={(event) => key(event, item, index)}
                            className={cx(
                                'inline-flex size-8 shrink-0 touch-none items-center justify-center rounded-md border-0 bg-transparent text-steel transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent max-md:size-11',
                                dragging ? 'cursor-grabbing text-accent' : 'cursor-grab',
                            )}>
                            <Icon name="grip" />
                        </button>
                        {renderItem(item)}
                    </div>
                );
            })}
        </div>
    );
}

// ----------------------------------------------------------------- Table

export interface Column<T> {
    title?: ReactNode;
    dataIndex?: string;
    key?: string;
    className?: string;
    align?: 'left' | 'center' | 'right';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render?: (value: any, row: T, index: number) => ReactNode;
}

// A plain responsive table: scrolls sideways inside its container, with a
// sticky header row.
export function Table<T extends object>({
    columns,
    dataSource,
    rowKey,
    className,
    locale,
}: {
    columns: Array<Column<T>>;
    dataSource: T[];
    rowKey: string | ((row: T) => string);
    className?: string;
    locale?: { emptyText?: ReactNode };
    // Accepted for call-site compatibility; tables here are never paginated.
    pagination?: false;
    scroll?: { x?: string | number };
}) {
    const keyOf = (row: T) =>
        typeof rowKey === 'function'
            ? rowKey(row)
            : String((row as Record<string, unknown>)[rowKey]);
    const align = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
    return (
        <div className={cx('overflow-x-auto', className)}>
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr>
                        {columns.map((column, index) => (
                            <th
                                key={column.key ?? column.dataIndex ?? index}
                                className={cx(
                                    'sticky top-0 z-1 border-b border-line bg-paper px-4 py-3 font-semibold whitespace-nowrap max-md:px-2',
                                    align[column.align ?? 'left'],
                                    column.className,
                                )}>
                                {column.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataSource.length === 0 && (
                        <tr>
                            <td colSpan={columns.length}>{locale?.emptyText ?? <Empty />}</td>
                        </tr>
                    )}
                    {dataSource.map((row, rowIndex) => (
                        <tr key={keyOf(row)} className="hover:bg-ink/5">
                            {columns.map((column, index) => {
                                const value = column.dataIndex
                                    ? (row as Record<string, unknown>)[column.dataIndex]
                                    : undefined;
                                return (
                                    <td
                                        key={column.key ?? column.dataIndex ?? index}
                                        className={cx(
                                            'border-b border-line px-4 py-3 align-middle max-md:px-2',
                                            align[column.align ?? 'left'],
                                            column.className,
                                        )}>
                                        {column.render
                                            ? column.render(value, row, rowIndex)
                                            : (value as ReactNode)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ------------------------------------------------------------ Pagination

export function Pagination({
    current,
    pageSize,
    total,
    onChange,
}: {
    current: number;
    pageSize: number;
    total: number;
    onChange?: (page: number) => void;
    size?: 'small';
    showSizeChanger?: boolean;
}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 py-2">
            <Button
                size="small"
                icon={<Icon name="chevronLeft" />}
                aria-label="Previous page"
                disabled={current <= 1}
                onClick={() => onChange?.(current - 1)}
            />
            <span className="text-sm text-steel">
                Page {current} of {pages}
            </span>
            <Button
                size="small"
                icon={<Icon name="chevronRight" />}
                aria-label="Next page"
                disabled={current >= pages}
                onClick={() => onChange?.(current + 1)}
            />
        </nav>
    );
}
