import type { KeyboardEvent, ReactNode } from 'react';

export function BlockCard({
    children,
    className = '',
    onClick,
}: {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
}) {
    const interactive = Boolean(onClick);
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onClick?.();
        }
    };
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
