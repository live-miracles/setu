function toUserDTO(user: User): UserDTO {
    const department = user.DepartmentId ? Tables.Departments.findById(user.DepartmentId) : null;
    return Object.assign({}, user, { departmentName: department ? department.Name : '' });
}

// The `Users` sheet is keyed by email (see SheetTable.ts's keyColumn) and
// doubles as the allowlist, but unlike an invite flow there is no separate
// approval step: anyone signing in with a Google account on
// ALLOWED_EMAIL_DOMAIN self-registers as a member on first call, matching
// the source app's domain-based auto-registration. There is also no
// per-user disable switch — revoking access is entirely a matter of the
// underlying Google account/domain membership, not a flag in this sheet.
function getCurrentActor(): User {
    const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
    if (!email) {
        throw new AuthenticationError(
            'Could not determine your Google account. Make sure you are signed in.',
        );
    }

    const existing = Tables.Users.findById(email);
    if (existing) return existing;

    const props = PropertiesService.getScriptProperties();
    const allowedDomain = (props.getProperty('ALLOWED_EMAIL_DOMAIN') || '').toLowerCase();
    const emailDomain = email.split('@')[1] || '';
    if (!allowedDomain || emailDomain !== allowedDomain) {
        throw new AuthenticationError(
            'Your Google account is not registered for this app. Ask an administrator.',
        );
    }

    const bootstrapEmail = (props.getProperty('BOOTSTRAP_ADMIN_EMAIL') || '').toLowerCase();
    const isBootstrapAdmin = Boolean(bootstrapEmail) && email === bootstrapEmail;

    return withLock(() => {
        const alreadyCreated = Tables.Users.findById(email);
        if (alreadyCreated) return alreadyCreated;
        return Tables.Users.insert({
            Email: email,
            Name: email.split('@')[0],
            Role: isBootstrapAdmin ? 'admin' : 'member',
            DepartmentId: '',
            Timezone: 'Asia/Kolkata',
            Phone: '',
            Whatsapp: '',
        });
    });
}

function requireUser(): User {
    return getCurrentActor();
}

function requireAdmin(): User {
    const actor = getCurrentActor();
    if (actor.Role !== 'admin') {
        throw new AuthorizationError('Administrator access is required.');
    }
    return actor;
}

function whoAmI(): UserDTO {
    return toUserDTO(requireUser());
}
