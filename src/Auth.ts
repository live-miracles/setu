function toProfileDTO(profile: Profile): ProfileDTO {
    const department = profile.DepartmentId
        ? Tables.Departments.findById(profile.DepartmentId)
        : null;
    const { AvatarDriveFileId, ...rest } = profile;
    return Object.assign({}, rest, { departmentName: department ? department.Name : '' });
}

// The `Profiles` sheet itself is the allowlist: a row must already exist
// (created by an admin via inviteUser, status 'invited') before a Google
// account is granted access. First successful call flips invited -> active.
function getCurrentActor(): Profile {
    const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
    if (!email) {
        throw new AuthenticationError(
            'Could not determine your Google account. Make sure you are signed in.',
        );
    }

    let profile = Tables.Profiles.findWhere((p) => p.Email === email)[0] || null;

    if (!profile) {
        const bootstrapEmail = (
            PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_EMAIL') || ''
        ).toLowerCase();
        const noProfilesYet = Tables.Profiles.readAll().length === 0;
        if (noProfilesYet && bootstrapEmail && email === bootstrapEmail) {
            profile = withLock(() => {
                const alreadyCreated = Tables.Profiles.findWhere((p) => p.Email === email)[0];
                if (alreadyCreated) return alreadyCreated;
                const created = Tables.Profiles.insert({
                    Email: email,
                    Name: email.split('@')[0],
                    Role: 'admin',
                    Status: 'active',
                    DepartmentId: '',
                    Timezone: 'Asia/Kolkata',
                    Phone: '',
                    Whatsapp: '',
                    AvatarDriveFileId: '',
                    NotificationEmail: true,
                    CreatedAt: nowIso(),
                    UpdatedAt: nowIso(),
                });
                logActivity(
                    created.Id,
                    'profile',
                    created.Id,
                    'bootstrap_admin',
                    null,
                    created,
                    {},
                );
                return created;
            });
        } else {
            throw new AuthenticationError(
                'Your Google account is not registered for this app. Ask an administrator to invite you.',
            );
        }
    }

    if (profile.Status === 'disabled') {
        throw new AuthorizationError('Your access has been disabled.');
    }

    if (profile.Status === 'invited') {
        const before = { Status: profile.Status };
        profile = withLock(() =>
            Tables.Profiles.updateById(profile!.Id, { Status: 'active', UpdatedAt: nowIso() }),
        );
        logActivity(
            profile.Id,
            'profile',
            profile.Id,
            'activate',
            before,
            { Status: 'active' },
            {},
        );
    }

    return profile;
}

function requireUser(): Profile {
    return getCurrentActor();
}

function requireAdmin(): Profile {
    const actor = getCurrentActor();
    if (actor.Role !== 'admin') {
        throw new AuthorizationError('Administrator access is required.');
    }
    return actor;
}

function whoAmI(): ProfileDTO {
    return toProfileDTO(requireUser());
}
