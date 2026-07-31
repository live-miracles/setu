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
            NotificationEmail: true,
        });
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

    const updated = withLock(() =>
        Tables.Profiles.updateById(profileId, {
            Role: patch.role !== undefined ? patch.role : target.Role,
            Status: patch.status !== undefined ? patch.status : target.Status,
            DepartmentId:
                patch.departmentId !== undefined ? patch.departmentId : target.DepartmentId,
            Timezone: patch.timezone !== undefined ? patch.timezone : target.Timezone,
        }),
    );
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
        }),
    );
    return toProfileDTO(updated);
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

function listLocations(): Place[] {
    requireUser();
    return Tables.Locations.readAll();
}

function createLocation(input: CreateLocationInput, requestId: string): Place {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('location:create', requestId, () => {
        return Tables.Locations.insert({
            Name: name,
        });
    });
    return result;
}

function listLinks(): Link[] {
    requireUser();
    return Tables.Links.readAll().sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

function createLink(input: CreateLinkInput, requestId: string): Link {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const url = requireNonEmpty(input.url, 'URL is required.');
    const { result } = withLockedDedupe('link:create', requestId, () => {
        return Tables.Links.insert({
            Name: name,
            Url: url,
            DisplayOrder: input.displayOrder || 0,
            Enabled: input.enabled !== false,
        });
    });
    return result;
}

function getHomeContent(): HomeContent {
    requireUser();
    return Tables.HomeContent.findById('singleton')!;
}

function updateHomeContent(input: UpdateHomeContentInput): HomeContent {
    const actor = requireAdmin();
    return withLock(() =>
        Tables.HomeContent.updateById('singleton', {
            SupportMessage: input.supportMessage || '',
            Guidelines: input.guidelines || '',
            WhatsappUrl: input.whatsappUrl || '',
            TutorialUrl: input.tutorialUrl || '',
            UpdatedBy: actor.Id,
        }),
    );
}
