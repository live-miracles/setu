import type { ReactNode } from 'react';
import { Input } from './form-kit';
import { Icon } from './icons';

// The heading of a list page (requests, users, departments, inventory), so
// they all lay out the same way. The title (or the kind switch) is on the left
// and the actions (add, download) are always on the same top line at the right.
// The search box and filters follow in `children`: beside the title on a wide
// screen, on their own line below it on a phone (see .resource-page-heading in
// input.css).
export function ListHeading({
    title,
    actions,
    children,
}: {
    title: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="app-page-heading resource-page-heading">
            <div>{title}</div>
            {children && <div className="board-filters">{children}</div>}
            {actions && <div className="heading-actions">{actions}</div>}
        </div>
    );
}

// The search box of a list page. The magnifier is the submit button, so the box
// stays short enough to share a phone-width line with the filters. `noun` names
// what is searched for assistive technology; the placeholder stays short.
export function SearchBox({
    noun,
    value,
    onChange,
    onSubmit,
}: {
    noun: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
}) {
    const label = `Search ${noun}`;
    return (
        <div className="board-search">
            <Input
                allowClear
                enterKeyHint="search"
                prefix={
                    <button
                        type="button"
                        onClick={onSubmit}
                        aria-label={label}
                        title={label}
                        className="inline-flex cursor-pointer items-center bg-transparent p-2 -m-2 text-steel hover:text-accent">
                        <Icon name="search" />
                    </button>
                }
                placeholder="Search"
                aria-label={label}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onPressEnter={onSubmit}
            />
        </div>
    );
}
