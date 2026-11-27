import {
    HIDEABLE_VIEWS,
    normalizeViewOrder,
    type HideableView,
} from '../../../supabase/functions/_shared/views';
import type { RequestKind } from './request-kind';

// Which views an admin has hidden (Other settings). Presentation only: a hidden
// view leaves the navigation and the home screen, but its pages and the API
// still work.
export { HIDEABLE_VIEWS, type HideableView };

export const VIEW_LABELS: Record<HideableView, string> = {
    programs: 'Program requests',
    inventory: 'Inventory requests',
    calendar: 'Calendar',
    roster: 'Roster',
    'inventory-types': 'Inventory types',
    'inventory-labels': 'Inventory labels',
    blocks: 'Blocks',
};

// How the Other settings page groups the views. Every hideable view belongs to
// exactly one group (checked in views.test.ts); the stored list is unchanged.
export const VIEW_GROUPS: ReadonlyArray<{
    key: string;
    title: string;
    description: string;
    views: readonly HideableView[];
}> = [
    {
        key: 'programs',
        title: 'Programs',
        description: 'Program requests, the shared calendar, blocks and the roster.',
        views: ['programs', 'calendar', 'roster', 'blocks'],
    },
    {
        key: 'inventory',
        title: 'Inventory',
        description: 'Inventory requests, types and labels.',
        views: ['inventory', 'inventory-types', 'inventory-labels'],
    },
];

// The part of the home content that decides which views show and in what order.
export type ViewSettings =
    (Pick<HomeContent, 'HiddenViews'> & Partial<Pick<HomeContent, 'ViewOrder'>>) | null | undefined;

export function isViewVisible(homeContent: ViewSettings, view: HideableView): boolean {
    return !homeContent?.HiddenViews?.includes(view);
}

// Every view once, in the order the admin chose (the default order until then).
export function orderedViews(homeContent: ViewSettings): HideableView[] {
    return normalizeViewOrder(homeContent?.ViewOrder);
}

// Sorts items by where their views sit in the chosen order. An item that covers
// several views (the Requests tab covers both boards) sits where its first one
// does. Items that are not views at all (`undefined`) go last, in their own order.
export function sortByViewOrder<T>(
    homeContent: ViewSettings,
    items: readonly T[],
    viewsOf: (item: T) => readonly HideableView[] | undefined,
): T[] {
    const order = orderedViews(homeContent);
    const rank = (item: T) =>
        Math.min(
            ...(viewsOf(item) ?? []).map((view) => order.indexOf(view)),
            Number.POSITIVE_INFINITY,
        );
    return items
        .map((item, index) => ({ item, index, rank: rank(item) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item);
}

// The request kinds whose board is shown, in switch order.
export function visibleRequestKinds(homeContent: ViewSettings): RequestKind[] {
    return sortByViewOrder(
        homeContent,
        (['programs', 'inventory'] as const).filter((kind) => isViewVisible(homeContent, kind)),
        (kind) => [kind],
    );
}
