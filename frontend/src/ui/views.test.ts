import { normalizeHiddenViews } from '../../../supabase/functions/_shared/views';
import { isViewVisible, visibleRequestKinds } from './views';
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
