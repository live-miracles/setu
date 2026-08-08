import type { RouterConfig } from '../router';
import { renderRefineApp, renderRefineRegistration } from './refine-app';
import { renderRefineSettings } from './refine-settings';

// The routing table. It lives with the sections rather than inside router.ts
// so the routing core can stay free of section imports; `Record<SectionKey,
// SectionRenderer>` still makes a missing entry a compile error rather than a
// blank page.
export const ROUTER_CONFIG: RouterConfig = {
    sections: {
        home: (c, d) => renderRefineApp('home', c, d),
        roster: (c, d) => renderRefineApp('roster', c, d),
        inventory: (c, d) => renderRefineApp('inventory', c, d),
        programs: (c, d) => renderRefineApp('programs', c, d),
        tickets: (c, d) => renderRefineApp('tickets', c, d),
        profile: (c, d) => renderRefineApp('profile', c, d),
        users: (c, d) => renderRefineApp('users', c, d),
        departments: (c, d) => renderRefineSettings('departments', c, d),
        places: (c, d) => renderRefineSettings('places', c, d),
        'inventory-types': (c, d) => renderRefineSettings('inventory-types', c, d),
        blocks: (c, d) => renderRefineSettings('blocks', c, d),
        'home-content': (c, d) => renderRefineSettings('home-content', c, d),
    },
    registrationGate: renderRefineRegistration,
};
