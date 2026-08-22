import { Card } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export type DetailSectionProps = {
    children: ReactNode;
    title?: ReactNode;
    action?: ReactNode;
    className?: string;
    span?: 'auto' | 'full';
    maxWidth?: CSSProperties['maxWidth'];
    minHeight?: CSSProperties['minHeight'];
    maxHeight?: CSSProperties['maxHeight'];
};

export function DetailSections({ children }: { children: ReactNode }) {
    return <div className="detail-sections">{children}</div>;
}

export function DetailSection({
    children,
    title,
    action,
    className,
    span = 'auto',
    maxWidth,
    minHeight,
    maxHeight,
}: DetailSectionProps) {
    const style: CSSProperties = {
        maxWidth,
        minHeight,
        maxHeight,
    };
    return (
        <section
            className={`detail-section detail-section-${span}${className ? ` ${className}` : ''}`}
            style={style}>
            {title !== undefined ? (
                <Card title={title} extra={action}>
                    {children}
                </Card>
            ) : (
                children
            )}
        </section>
    );
}
