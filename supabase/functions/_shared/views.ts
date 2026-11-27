// The views an admin can hide from everyone on the Other settings page. Hiding
// only takes a view out of the navigation and the home screen; it is a
// presentation choice, not access control, and the API never reads it. The
// other pages for admins and approvers (users, departments, other settings)
// cannot be hidden, so a setting can never lock the admin out of this one.
//
// The list is stored as the keys of the views that are hidden, so a view added
// later is shown by default.

// This is also the default order, and it lists each group of the settings page
// (frontend/src/ui/views.ts) together, so moving a view inside its group never
// moves it past a view of another group.
export const HIDEABLE_VIEWS = [
    'programs',
    'calendar',
    'roster',
    'blocks',
    'inventory',
    'inventory-types',
    'inventory-labels',
] as const;

export type HideableView = (typeof HIDEABLE_VIEWS)[number];

// Keeps only known keys, once each, in the order HIDEABLE_VIEWS lists them.
export function normalizeHiddenViews(value: unknown): string[] {
    const requested = new Set(Array.isArray(value) ? value.map(String) : []);
    return HIDEABLE_VIEWS.filter((view) => requested.has(view));
}

// The order an admin chose for the views (the menu and the board switches
// follow it). Always lists every known view once: unknown keys and repeats are
// dropped, and views missing from the stored list (an empty list, or a view
// added later) follow in the order HIDEABLE_VIEWS lists them.
export function normalizeViewOrder(value: unknown): HideableView[] {
    const requested = Array.isArray(value) ? value.map(String) : [];
    const ordered = requested.filter(
        (key, index): key is HideableView =>
            (HIDEABLE_VIEWS as readonly string[]).includes(key) && requested.indexOf(key) === index,
    );
    return [...ordered, ...HIDEABLE_VIEWS.filter((view) => !ordered.includes(view))];
}
