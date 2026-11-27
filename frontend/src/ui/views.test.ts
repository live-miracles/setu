import {
    normalizeHiddenViews,
    normalizeViewOrder,
} from '../../../supabase/functions/_shared/views';
import {
    HIDEABLE_VIEWS,
    VIEW_GROUPS,
    isViewVisible,
    orderedViews,
    sortByViewOrder,
    visibleRequestKinds,
} from './views';
import { inventoryKindPath, visibleInventoryKinds } from './inventory-kind';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runViewsAssertions(): void {
    assert(
        normalizeHiddenViews(['roster', 'bogus', 'programs', 'roster']).join() ===
            'programs,roster',
        'hidden views should keep only known keys, once each, in the listed order',
    );
    assert(
        normalizeHiddenViews(undefined).length === 0 && normalizeHiddenViews('roster').length === 0,
        'anything that is not a list should hide nothing',
    );

    const grouped = VIEW_GROUPS.flatMap((group) => [...group.views]);
    assert(
        grouped.length === HIDEABLE_VIEWS.length &&
            HIDEABLE_VIEWS.every((view) => grouped.filter((item) => item === view).length === 1),
        'every hideable view should sit in exactly one settings group',
    );
    assert(
        grouped.join() === HIDEABLE_VIEWS.join(),
        'the default order should list each settings group together, in group order',
    );

    assert(isViewVisible(undefined, 'calendar'), 'every view is shown before settings load');
    assert(isViewVisible({ HiddenViews: [] }, 'calendar'), 'an empty list hides nothing');
    assert(
        !isViewVisible({ HiddenViews: ['calendar'] }, 'calendar') &&
            isViewVisible({ HiddenViews: ['calendar'] }, 'roster'),
        'only the listed views should be hidden',
    );
    assert(
        normalizeHiddenViews(['blocks', 'users']).join() === 'blocks' &&
            !isViewVisible({ HiddenViews: ['blocks'] }, 'blocks'),
        'blocks can be hidden, while admin pages such as users cannot',
    );

    assert(
        visibleRequestKinds({ HiddenViews: [] }).join() === 'programs,inventory',
        'both request kinds are shown by default',
    );
    assert(
        visibleRequestKinds({ HiddenViews: ['programs'] }).join() === 'inventory',
        'a hidden program board should leave only inventory',
    );
    assert(
        visibleRequestKinds({ HiddenViews: ['programs', 'inventory'] }).length === 0,
        'hiding both boards should leave no request kind',
    );

    const defaultOrder = HIDEABLE_VIEWS.join();
    assert(
        normalizeViewOrder(undefined).join() === defaultOrder &&
            normalizeViewOrder([]).join() === defaultOrder &&
            normalizeViewOrder('blocks').join() === defaultOrder,
        'no stored order should give the default order',
    );
    assert(
        normalizeViewOrder(['blocks', 'bogus', 'roster', 'blocks']).join() ===
            [
                'blocks',
                'roster',
                ...HIDEABLE_VIEWS.filter((v) => v !== 'blocks' && v !== 'roster'),
            ].join(),
        'a stored order should drop unknown keys and repeats and keep views it lacks, after the listed ones',
    );
    assert(
        orderedViews({ HiddenViews: [] }).join() === defaultOrder &&
            orderedViews({ HiddenViews: [], ViewOrder: ['inventory'] })[0] === 'inventory',
        'the chosen order should be read from the home content',
    );
    assert(
        visibleRequestKinds({ HiddenViews: [], ViewOrder: ['inventory', 'programs'] }).join() ===
            'inventory,programs',
        'the board switch should follow the chosen order',
    );
    assert(
        visibleInventoryKinds({
            HiddenViews: [],
            ViewOrder: ['inventory-labels', 'inventory-types'],
        }).join() === 'labels,types',
        'the inventory switch should follow the chosen order',
    );
    assert(
        sortByViewOrder(
            { HiddenViews: [], ViewOrder: ['blocks', 'inventory', 'calendar'] },
            [
                { key: 'users' },
                { key: 'calendar', views: ['calendar' as const] },
                { key: 'requests', views: ['programs' as const, 'inventory' as const] },
                { key: 'blocks', views: ['blocks' as const] },
            ],
            (item) => item.views,
        )
            .map((item) => item.key)
            .join() === 'blocks,requests,calendar,users',
        'menu items should sit where their first view does, and items without a view go last',
    );

    assert(
        visibleInventoryKinds({ HiddenViews: [] }).join() === 'types,labels',
        'both inventory kinds are shown by default',
    );
    assert(
        visibleInventoryKinds({ HiddenViews: ['inventory-types'] }).join() === 'labels' &&
            visibleInventoryKinds({ HiddenViews: ['inventory-labels'] }).join() === 'types',
        'hiding one inventory kind should leave the other',
    );
    assert(
        visibleInventoryKinds({ HiddenViews: ['inventory-types', 'inventory-labels'] }).length ===
            0,
        'hiding both inventory kinds should leave none',
    );
    assert(
        inventoryKindPath('types') === '/inventory-types' &&
            inventoryKindPath('labels') === '/inventory-labels',
        'each inventory kind should map to its page path',
    );
}
