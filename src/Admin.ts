// Approvers get this list read-only — they need it to pick a ticket
// assignee or a shift's crew member — but only an admin can write to it via
// updateUser below.
function listUsers(): UserDTO[] {
    requireApprover();
    return Tables.Users.readAll().map(toUserDTO);
}

function updateUser(userId: string, patch: UpdateUserInput): UserDTO {
    const actor = requireAdmin();
    const target = Tables.Users.findById(userId);
    if (!target) throw new ValidationError('not_found');

    if (patch.role !== undefined && USER_ROLES.indexOf(patch.role) === -1) {
        throw new ValidationError('unknown_role');
    }
    if (target.Email === actor.Email && patch.role && patch.role !== 'admin') {
        throw new ConflictError('You cannot remove your own administrator access.');
    }

    const updated = withLock(() =>
        Tables.Users.updateById(userId, {
            Role: patch.role !== undefined ? patch.role : target.Role,
            DepartmentId:
                patch.departmentId !== undefined ? patch.departmentId : target.DepartmentId,
            Timezone: patch.timezone !== undefined ? patch.timezone : target.Timezone,
        }),
    );
    return toUserDTO(updated);
}

// Also doubles as the registration-completion call: the frontend shows a
// mandatory registration form (gated on Phone being unset) instead of the
// app on first sign-in, and submitting it hits this same endpoint. Phone is
// required (like Name), so the first successful save is what completes
// registration — there is no separate registered flag.
function updateOwnProfile(patch: UpdateOwnProfileInput): UserDTO {
    const actor = requireUser();
    const updated = withLock(() =>
        Tables.Users.updateById(actor.Email, {
            Name:
                patch.name !== undefined
                    ? requireNonEmpty(patch.name, 'Name is required.')
                    : actor.Name,
            DepartmentId:
                patch.departmentId !== undefined ? patch.departmentId : actor.DepartmentId,
            Phone:
                patch.phone !== undefined
                    ? requireNonEmpty(patch.phone, 'Phone is required.')
                    : actor.Phone,
            Whatsapp: patch.whatsapp !== undefined ? patch.whatsapp : actor.Whatsapp,
            Timezone: patch.timezone !== undefined ? patch.timezone : actor.Timezone,
        }),
    );
    return toUserDTO(updated);
}

function listDepartments(): Department[] {
    requireUser();
    return Tables.Departments.readAll();
}

function createDepartment(input: CreateDepartmentInput, requestId: string): Department {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('department:create', requestId, () => {
        return Tables.Departments.insert({
            Name: name,
            ShortName: input.shortName || '',
        });
    });
    return result;
}

function listPlaces(): Place[] {
    requireUser();
    return Tables.Places.readAll();
}

function createPlace(input: CreatePlaceInput, requestId: string): Place {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('place:create', requestId, () => {
        return Tables.Places.insert({
            Name: name,
        });
    });
    return result;
}

// Links have no dedicated tab — they're a JSON-encoded array in one
// Settings row (Id 'links'), the same generic-key-value approach
// HomeContent below already uses for its individual fields.
function readLinks(): Link[] {
    const setting = Tables.Settings.findById('links');
    if (!setting || !setting.Value) return [];
    try {
        return JSON.parse(setting.Value) as Link[];
    } catch (err) {
        return [];
    }
}

function writeLinks(links: Link[]): void {
    upsertSetting('links', JSON.stringify(links));
}

function listLinks(): Link[] {
    requireUser();
    return readLinks().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createLink(input: CreateLinkInput, requestId: string): Link {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const url = requireNonEmpty(input.url, 'URL is required.');
    const { result } = withLockedDedupe('link:create', requestId, () => {
        const created: Link = {
            Id: Utilities.getUuid(),
            Name: name,
            Url: url,
            Enabled: input.enabled !== false,
        };
        const links = readLinks();
        links.push(created);
        writeLinks(links);
        return created;
    });
    return result;
}

// Home content is just a handful of settings rows, keyed by field name
// (see SettingRow in shared/types.d.ts).
function readHomeContent(): HomeContent {
    const settingsById = indexBy(Tables.Settings.readAll(), (s) => s.Id);
    return {
        SupportMessage: settingsById['SupportMessage'] ? settingsById['SupportMessage'].Value : '',
        Guidelines: settingsById['Guidelines'] ? settingsById['Guidelines'].Value : '',
        WhatsappUrl: settingsById['WhatsappUrl'] ? settingsById['WhatsappUrl'].Value : '',
        TutorialUrl: settingsById['TutorialUrl'] ? settingsById['TutorialUrl'].Value : '',
    };
}

function upsertSetting(key: string, value: string): void {
    if (Tables.Settings.findById(key)) {
        Tables.Settings.updateById(key, { Value: value });
    } else {
        Tables.Settings.insert({ Id: key, Value: value });
    }
}

function getHomeContent(): HomeContent {
    requireUser();
    return readHomeContent();
}

function updateHomeContent(input: UpdateHomeContentInput): HomeContent {
    requireAdmin();
    return withLock(() => {
        upsertSetting('SupportMessage', input.supportMessage || '');
        upsertSetting('Guidelines', input.guidelines || '');
        upsertSetting('WhatsappUrl', input.whatsappUrl || '');
        upsertSetting('TutorialUrl', input.tutorialUrl || '');
        return readHomeContent();
    });
}
