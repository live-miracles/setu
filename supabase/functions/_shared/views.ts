// The views an admin can hide from everyone on the Other settings page. Hiding
// only takes a view out of the navigation and the home screen; it is a
// presentation choice, not access control, and the API never reads it. Pages
// for admins and approvers (users, departments, blocks, other settings) cannot
// be hidden, so a setting can never lock the admin out of this one.
//
// The list is stored as the keys of the views that are hidden, so a view added
// later is shown by default.

export const HIDEABLE_VIEWS = [
    'programs',
    'inventory',
    'calendar',
    'roster',
    'inventory-types',
] as const;

export type HideableView = (typeof HIDEABLE_VIEWS)[number];

// Keeps only known keys, once each, in the order HIDEABLE_VIEWS lists them.
export function normalizeHiddenViews(value: unknown): string[] {
    const requested = new Set(Array.isArray(value) ? value.map(String) : []);
    return HIDEABLE_VIEWS.filter((view) => requested.has(view));
}
