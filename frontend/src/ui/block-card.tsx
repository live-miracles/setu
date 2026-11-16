import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { isPlainLeftClick } from './link-click';

export function BlockCard({
    children,
    className = '',
    href,
    onClick,
    selected = false,
}: {
    children: ReactNode;
    className?: string;
    href?: string;
    onClick?: () => void;
    // The record currently open beside the list.
    selected?: boolean;
}) {
    const interactive = Boolean(onClick);
    const blockClassName = `record-block ${className}${selected ? ' is-selected' : ''}`.trim();
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onClick?.();
        }
    };
    if (href) {
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            if (!isPlainLeftClick(event)) return;
            event.preventDefault();
            onClick?.();
        };
        return (
            <a
                className={blockClassName}
                href={href}
                aria-current={selected ? 'true' : undefined}
                onClick={handleClick}
                onKeyDown={handleKeyDown}>
                {children}
            </a>
        );
    }
    return (
        <article
            className={blockClassName}
            aria-current={selected ? 'true' : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={onClick}
            onKeyDown={handleKeyDown}>
            {children}
        </article>
    );
}
