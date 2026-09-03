import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { isPlainLeftClick } from './link-click';

export function BlockCard({
    children,
    className = '',
    href,
    onClick,
}: {
    children: ReactNode;
    className?: string;
    href?: string;
    onClick?: () => void;
}) {
    const interactive = Boolean(onClick);
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
                className={`record-block ${className}`.trim()}
                href={href}
                onClick={handleClick}
                onKeyDown={handleKeyDown}>
                {children}
            </a>
        );
    }
    return (
        <article
            className={`record-block ${className}`.trim()}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={onClick}
            onKeyDown={handleKeyDown}>
            {children}
        </article>
    );
}
