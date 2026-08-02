import type { RouterConfig } from '../router';
import { renderHome } from './home';
import { renderInventory } from './inventory';
import { renderProfile, renderRegistrationGate } from './profile';
import { renderPrograms } from './programs';
import { renderRoster } from './roster';
import {
    SETTINGS_LIST_PAGES,
    renderHomeContent,
    renderSettingsList,
    renderUsers,
} from './settings';
import { renderTickets } from './tickets';

// The routing table. It lives with the sections rather than inside router.ts
// so the routing core can stay free of section imports; `Record<SectionKey,
// SectionRenderer>` still makes a missing entry a compile error rather than a
// blank page.
export const ROUTER_CONFIG: RouterConfig = {
    sections: {
        home: renderHome,
        roster: renderRoster,
        inventory: renderInventory,
        programs: renderPrograms,
        tickets: renderTickets,
        profile: renderProfile,
        users: renderUsers,
        departments: (c, d) => renderSettingsList(SETTINGS_LIST_PAGES.departments, c, d),
        places: (c, d) => renderSettingsList(SETTINGS_LIST_PAGES.places, c, d),
        'inventory-types': (c, d) =>
            renderSettingsList(SETTINGS_LIST_PAGES['inventory-types'], c, d),
        'home-content': renderHomeContent,
    },
    registrationGate: renderRegistrationGate,
};
