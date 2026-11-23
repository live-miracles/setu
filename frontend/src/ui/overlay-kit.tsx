import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, Spinner, cx } from './kit';
import { Icon } from './icons';
import { useDismiss, useFloatingStyle } from './form-kit';

// Overlays: Modal (native <dialog>), Popover, DropdownMenu and toasts.

// ----------------------------------------------------------------- Modal

// A native modal <dialog>: the browser supplies the focus trap, Escape to
// close, inert page behind it and top-layer stacking, so nested modals work.
export function Modal({
    title,
    close,
    className,
    children,
}: {
    title: ReactNode;
    close: () => void;
    className?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const pressedBackdrop = useRef(false);
    useEffect(() => {
        const dialog = ref.current;
        if (dialog && !dialog.open) dialog.showModal();
        return () => dialog?.close();
    }, []);
    return (
        <dialog
            ref={ref}
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
            // The dialog has no padding of its own, so a press that lands on it
            // (not on the panel inside) is a press on the backdrop. Close only
            // when the press started AND ended there: dragging out of the panel
            // (e.g. selecting text) also fires a click on the dialog.
            onPointerDown={(event) => {
                pressedBackdrop.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
                const closeIt = pressedBackdrop.current && event.target === event.currentTarget;
                pressedBackdrop.current = false;
                if (closeIt) close();
            }}
            className={cx(
                'm-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),34rem)] rounded-xl border-0 bg-surface p-0 text-ink shadow-overlay backdrop:bg-black/40',
                className,
            )}>
            <div className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="m-0 text-lg font-semibold">{title}</h2>
                    <Button
                        type="text"
                        size="small"
                        aria-label="Close"
                        icon={<Icon name="close" />}
                        onClick={close}
                    />
                </div>
                {children}
            </div>
        </dialog>
    );
}

// --------------------------------------------------------------- Popover

// A click-toggled panel anchored under its trigger (controlled).
export function Popover({
    open,
    onOpenChange,
    title,
    content,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: ReactNode;
    content: ReactNode;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, open, () => onOpenChange(false));
    const style = useFloatingStyle(ref, open, { align: 'end', maxHeight: 480 });
    return (
        <div ref={ref} className="relative inline-block">
            <span onClick={() => onOpenChange(!open)}>{children}</span>
            {open && (
                <div
                    style={style}
                    className="z-50 w-72 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-line bg-surface p-4 shadow-overlay">
                    {title && <div className="mb-2 font-semibold">{title}</div>}
                    {content}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------- DropdownMenu

// A `label` is a non-interactive row: a small group heading, or (with a
// description) an identity header such as "name / email".
export type MenuItem =
    | { key: string; label: ReactNode; icon?: ReactNode; selected?: boolean }
    | { type: 'divider' }
    | { type: 'label'; label: ReactNode; description?: ReactNode };

export function DropdownMenu({
    items,
    onSelect,
    children,
    className,
    align = 'end',
    placement = 'bottom',
}: {
    items: MenuItem[];
    onSelect: (key: string) => void;
    children: ReactNode;
    // Classes for the wrapper, so a trigger can stretch inside a flex row.
    className?: string;
    // Which edge of the trigger the menu lines up with.
    align?: 'start' | 'end';
    // Open below the trigger, or above it (for triggers at the screen bottom).
    placement?: 'bottom' | 'top';
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    useDismiss(ref, open, () => setOpen(false));
    const style = useFloatingStyle(ref, open, { align, placement, maxHeight: 480 });
    return (
        <div ref={ref} className={cx('relative', className ?? 'inline-block')}>
            <span className="contents" onClick={() => setOpen(!open)}>
                {children}
            </span>
            {open && (
                <div
                    role="menu"
                    style={style}
                    className="z-50 min-w-48 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-overlay max-md:min-w-56">
                    {items.map((item, index) => {
                        if ('type' in item) {
                            if (item.type === 'divider') {
                                return (
                                    <hr
                                        key={`divider-${index}`}
                                        className="my-1 border-0 border-t border-line"
                                    />
                                );
                            }
                            return (
                                <div key={`label-${index}`} className="px-3 py-2">
                                    <div
                                        className={
                                            item.description
                                                ? 'truncate text-sm font-semibold text-ink'
                                                : 'text-xs font-semibold tracking-wide text-steel uppercase'
                                        }>
                                        {item.label}
                                    </div>
                                    {item.description && (
                                        <div className="truncate text-xs text-steel">
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                aria-current={item.selected ? 'page' : undefined}
                                onClick={() => {
                                    setOpen(false);
                                    onSelect(item.key);
                                }}
                                className={cx(
                                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5 max-md:py-3',
                                    item.selected && 'bg-accent/10 font-medium text-accent',
                                )}>
                                {item.icon}
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- Toasts

// A tiny store feeds <ToastViewport/>, mounted once in AppProviders, so any
// code (including non-React helpers in feedback.ts) can raise a toast.
interface Toast {
    id: string;
    kind: 'loading' | 'error';
    title: string;
    description?: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function dismissToast(id: string): void {
    toasts = toasts.filter((toast) => toast.id !== id);
    emit();
}

let toastCounter = 0;
export function pushToast(toast: Omit<Toast, 'id'> & { id?: string }, autoDismissMs = 0): string {
    const id = toast.id ?? `toast-${++toastCounter}`;
    toasts = [...toasts.filter((existing) => existing.id !== id), { ...toast, id }];
    emit();
    if (autoDismissMs) setTimeout(() => dismissToast(id), autoDismissMs);
    return id;
}

export function ToastViewport() {
    const current = useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => toasts,
    );
    if (!current.length) return null;
    return (
        <div className="fixed top-4 right-4 z-[1000] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 max-md:left-4">
            {current.map((toast) => (
                <div
                    key={toast.id}
                    role={toast.kind === 'error' ? 'alert' : 'status'}
                    className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-overlay">
                    {toast.kind === 'loading' ? (
                        <Spinner className="mt-0.5 text-accent" />
                    ) : (
                        <Icon name="alert" className="mt-0.5 text-error" />
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="font-semibold">{toast.title}</div>
                        {toast.description && (
                            <div className="text-sm whitespace-pre-line text-steel">
                                {toast.description}
                            </div>
                        )}
                    </div>
                    {toast.kind === 'error' && (
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => dismissToast(toast.id)}
                            className="cursor-pointer text-steel hover:text-ink">
                            <Icon name="close" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
