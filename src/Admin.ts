const ACTIVITY_LOG_PAGE_SIZE = 50;

function listUsers(): ProfileDTO[] {
    requireAdmin();
    return Tables.Profiles.readAll().map(toProfileDTO);
}

function inviteUser(input: InviteUserInput, requestId: string): ProfileDTO {
    const actor = requireAdmin();
    const email = requireNonEmpty(input.email, 'Email is required.').toLowerCase();
    const name = requireNonEmpty(input.name, 'Name is required.');

    const { result } = withLockedDedupe('profile:invite', requestId, () => {
        const existing = Tables.Profiles.findWhere((p) => p.Email === email)[0];
        if (existing) throw new ConflictError('A profile with this email already exists.');
        const created = Tables.Profiles.insert({
            Email: email,
            Name: name,
            Role: input.role,
            Status: 'invited',
            DepartmentId: input.departmentId || '',
            Timezone: input.timezone || 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
            AvatarDriveFileId: '',
            NotificationEmail: true,
            CreatedAt: nowIso(),
            UpdatedAt: nowIso(),
        });
        logActivity(actor.Id, 'profile', created.Id, 'invite', null, created, {});
        return created;
    });

    return toProfileDTO(result);
}

function updateUser(profileId: string, patch: UpdateUserInput): ProfileDTO {
    const actor = requireAdmin();
    const target = Tables.Profiles.findById(profileId);
    if (!target) throw new ValidationError('not_found');

    if (target.Id === actor.Id) {
        if (patch.role && patch.role !== 'admin')
            throw new ConflictError('You cannot demote your own account.');
        if (patch.status && patch.status !== 'active')
            throw new ConflictError('You cannot disable your own account.');
    }

    const before = Object.assign({}, target);
    const updated = withLock(() =>
        Tables.Profiles.updateById(profileId, {
            Role: patch.role !== undefined ? patch.role : target.Role,
            Status: patch.status !== undefined ? patch.status : target.Status,
            DepartmentId:
                patch.departmentId !== undefined ? patch.departmentId : target.DepartmentId,
            Timezone: patch.timezone !== undefined ? patch.timezone : target.Timezone,
            UpdatedAt: nowIso(),
        }),
    );
    logActivity(actor.Id, 'profile', profileId, 'update_access', before, updated, {});
    return toProfileDTO(updated);
}

function updateOwnProfile(patch: UpdateOwnProfileInput): ProfileDTO {
    const actor = requireUser();
    const updated = withLock(() =>
        Tables.Profiles.updateById(actor.Id, {
            Name:
                patch.name !== undefined
                    ? requireNonEmpty(patch.name, 'Name is required.')
                    : actor.Name,
            Phone: patch.phone !== undefined ? patch.phone : actor.Phone,
            Whatsapp: patch.whatsapp !== undefined ? patch.whatsapp : actor.Whatsapp,
            Timezone: patch.timezone !== undefined ? patch.timezone : actor.Timezone,
            NotificationEmail:
                patch.notificationEmail !== undefined
                    ? patch.notificationEmail
                    : actor.NotificationEmail,
            UpdatedAt: nowIso(),
        }),
    );
    return toProfileDTO(updated);
}

function listDepartments(): Department[] {
    requireUser();
    return Tables.Departments.readAll();
}

function createDepartment(input: CreateDepartmentInput, requestId: string): Department {
    const actor = requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('department:create', requestId, () => {
        const created = Tables.Departments.insert({
            Name: name,
            ShortName: input.shortName || '',
            CreatedAt: nowIso(),
            UpdatedAt: nowIso(),
        });
        logActivity(actor.Id, 'department', created.Id, 'create', null, created, {});
        return created;
    });
    return result;
}

function listLocations(): LocationRecord[] {
    requireUser();
    return Tables.Locations.readAll();
}

function createLocation(input: CreateLocationInput, requestId: string): LocationRecord {
    const actor = requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('location:create', requestId, () => {
        const created = Tables.Locations.insert({
            Name: name,
            CreatedAt: nowIso(),
            UpdatedAt: nowIso(),
        });
        logActivity(actor.Id, 'location', created.Id, 'create', null, created, {});
        return created;
    });
    return result;
}

function listLinks(): Link[] {
    requireUser();
    return Tables.Links.readAll().sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

function createLink(input: CreateLinkInput, requestId: string): Link {
    const actor = requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const url = requireNonEmpty(input.url, 'URL is required.');
    const { result } = withLockedDedupe('link:create', requestId, () => {
        const created = Tables.Links.insert({
            Name: name,
            Url: url,
            DisplayOrder: input.displayOrder || 0,
            Enabled: input.enabled !== false,
            CreatedAt: nowIso(),
            UpdatedAt: nowIso(),
        });
        logActivity(actor.Id, 'link', created.Id, 'create', null, created, {});
        return created;
    });
    return result;
}

function getHomeContent(): HomeContent {
    requireUser();
    return Tables.HomeContent.findById('singleton')!;
}

function updateHomeContent(input: UpdateHomeContentInput): HomeContent {
    const actor = requireAdmin();
    const before = Tables.HomeContent.findById('singleton');
    const updated = withLock(() =>
        Tables.HomeContent.updateById('singleton', {
            SupportMessage: input.supportMessage || '',
            Guidelines: input.guidelines || '',
            WhatsappUrl: input.whatsappUrl || '',
            TutorialUrl: input.tutorialUrl || '',
            UpdatedBy: actor.Id,
            UpdatedAt: nowIso(),
        }),
    );
    logActivity(actor.Id, 'home_content', 'singleton', 'update', before, updated, {});
    return updated;
}

function listActivityLog(page: number): Paginated<ActivityLogEntry> {
    requireAdmin();
    const sorted = Tables.ActivityLog.readAll().sort((a, b) =>
        b.Timestamp.localeCompare(a.Timestamp),
    );
    return paginate(sorted, page, ACTIVITY_LOG_PAGE_SIZE);
}
