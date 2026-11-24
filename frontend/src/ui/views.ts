import { HIDEABLE_VIEWS, type HideableView } from '../../../supabase/functions/_shared/views';
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

export function isViewVisible(
    homeContent: Pick<HomeContent, 'HiddenViews'> | null | undefined,
    view: HideableView,
): boolean {
    return !homeContent?.HiddenViews?.includes(view);
}

// The request kinds whose board is shown, in switch order.
export function visibleRequestKinds(
    homeContent: Pick<HomeContent, 'HiddenViews'> | null | undefined,
): RequestKind[] {
    return (['programs', 'inventory'] as const).filter((kind) => isViewVisible(homeContent, kind));
}
