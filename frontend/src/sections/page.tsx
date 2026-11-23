import type { ReactNode } from 'react';
import { Typography } from '../ui/kit';

export function Page({
    title,
    headingContent,
    action,
    className,
    hideHeading = false,
    children,
}: {
    title: string;
    headingContent?: ReactNode;
    action?: ReactNode;
    className?: string;
    hideHeading?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={`app-page${className ? ` ${className}` : ''}`}>
            {!hideHeading && (
                <div className="app-page-heading">
                    <div>
                        <Typography.Title level={2}>{title}</Typography.Title>
                    </div>
                    {headingContent}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
