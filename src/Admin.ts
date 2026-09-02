// Approvers get this list read-only — they need it to pick a ticket
// assignee or a shift's crew member — but only an admin can write to it via
// updateUser below.
function listUsers(): UserDTO[] {
    requireApprover();
    return Tables.Users.readAll().map(toUserDTO);
}

function createUser(input: CreateUserInput, requestId: string): UserDTO {
    requireAdmin();
    const email = requireNonEmpty(input.email, 'Email is required.').toLowerCase();
    const name = requireNonEmpty(input.name, 'Name is required.');
    if (USER_ROLES.indexOf(input.role) === -1) throw new ValidationError('unknown_role');
    if (input.departmentId && !Tables.Departments.findById(input.departmentId)) {
        throw new ValidationError('department_not_found');
    }

    const { result } = withLockedDedupe('user:create', requestId, () => {
        if (Tables.Users.findById(email)) throw new ConflictError('User already exists.');
        return Tables.Users.insert({
            Email: email,
            Name: name,
            Role: input.role,
            DepartmentId: input.departmentId || '',
            Phone: input.phone || '',
            Whatsapp: input.whatsapp || '',
        });
    });
    return toUserDTO(result);
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
    if (patch.departmentId && !Tables.Departments.findById(patch.departmentId)) {
        throw new ValidationError('department_not_found');
    }

    const updated = withLock(() =>
        Tables.Users.updateById(userId, {
            Name:
                patch.name !== undefined
                    ? requireNonEmpty(patch.name, 'Name is required.')
                    : target.Name,
            Role: patch.role !== undefined ? patch.role : target.Role,
            DepartmentId:
                patch.departmentId !== undefined ? patch.departmentId : target.DepartmentId,
            Phone: patch.phone !== undefined ? patch.phone : target.Phone,
            Whatsapp: patch.whatsapp !== undefined ? patch.whatsapp : target.Whatsapp,
        }),
    );
    return toUserDTO(updated);
}

function deleteUser(userId: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('user:delete', requestId, () => {
        Tables.Users.deleteById(userId);
        return null;
    });
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
            LeadEmail: String(input.leadEmail || '')
                .trim()
                .toLowerCase(),
        });
    });
    return result;
}

function updateDepartment(id: string, input: CreateDepartmentInput, requestId: string): Department {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('department:update', requestId, () => {
        if (!Tables.Departments.findById(id)) throw new ValidationError('not_found');
        return Tables.Departments.updateById(id, {
            Name: name,
            ShortName: input.shortName || '',
            LeadEmail: String(input.leadEmail || '')
                .trim()
                .toLowerCase(),
        });
    });
    return result;
}

function deleteDepartment(id: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('department:delete', requestId, () => {
        Tables.Departments.deleteById(id);
        return null;
    });
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

function updatePlace(id: string, input: CreatePlaceInput, requestId: string): Place {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('place:update', requestId, () => {
        if (!Tables.Places.findById(id)) throw new ValidationError('not_found');
        return Tables.Places.updateById(id, {
            Name: name,
        });
    });
    return result;
}

function deletePlace(id: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('place:delete', requestId, () => {
        Tables.Places.deleteById(id);
        return null;
    });
}

// Shift types and the other reusable options have no dedicated tabs; they are
// JSON-encoded arrays in the Settings key-value table.
function readShiftTypes(): ShiftType[] {
    const setting = Tables.Settings.findById('shiftTypes');
    if (!setting || !setting.Value) return [];
    try {
        return JSON.parse(setting.Value) as ShiftType[];
    } catch (err) {
        return [];
    }
}

function writeShiftTypes(shiftTypes: ShiftType[]): void {
    upsertSetting('shiftTypes', JSON.stringify(shiftTypes));
}

function createShiftType(input: CreateShiftTypeInput, requestId: string): ShiftType {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('shift-type:create', requestId, () => {
        const shiftTypes = readShiftTypes();
        if (shiftTypes.some((shiftType) => shiftType.Name === name)) {
            throw new ValidationError('A shift type with this name already exists.');
        }
        const created: ShiftType = {
            Name: name,
            Color: String(input.color || '').trim(),
            DefaultStartTime: input.defaultStartTime || '',
            DefaultEndTime: input.defaultEndTime || '',
        };
        shiftTypes.push(created);
        writeShiftTypes(shiftTypes);
        return created;
    });
    return result;
}

function updateShiftType(name: string, input: CreateShiftTypeInput, requestId: string): ShiftType {
    requireAdmin();
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('shift-type:update', requestId, () => {
        const shiftTypes = readShiftTypes();
        const existing = shiftTypes.find((shiftType) => shiftType.Name === name);
        if (!existing) throw new ValidationError('not_found');
        if (newName !== name && shiftTypes.some((shiftType) => shiftType.Name === newName)) {
            throw new ValidationError('A shift type with this name already exists.');
        }
        existing.Name = newName;
        existing.Color = String(input.color || '').trim();
        existing.DefaultStartTime = input.defaultStartTime || '';
        existing.DefaultEndTime = input.defaultEndTime || '';
        writeShiftTypes(shiftTypes);
        return existing;
    });
    return result;
}

function deleteShiftType(name: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('shift-type:delete', requestId, () => {
        writeShiftTypes(readShiftTypes().filter((shiftType) => shiftType.Name !== name));
        return null;
    });
}

const DEFAULT_PROGRAM_LANGUAGES: ProgramLanguage[] = [
    { Name: 'English' },
    { Name: 'Hindi' },
    { Name: 'Tamil' },
    { Name: 'Telugu' },
    { Name: 'Kannada' },
];

const DEFAULT_SESSION_TYPES: SessionType[] = [
    { Name: 'Live' },
    { Name: 'Dry Run' },
    { Name: 'Recording' },
];

function readNamedOptions<T extends { Name: string }>(key: string, fallback: T[]): T[] {
    const setting = Tables.Settings.findById(key);
    if (!setting || !setting.Value) return fallback.map((option) => Object.assign({}, option));
    try {
        return JSON.parse(setting.Value) as T[];
    } catch (err) {
        return fallback.map((option) => Object.assign({}, option));
    }
}

function writeNamedOptions(key: string, options: { Name: string }[]): void {
    upsertSetting(key, JSON.stringify(options));
}

function readProgramTypes(): ProgramType[] {
    // Program types are optional configuration. A fresh setup should remain
    // empty until an administrator adds the types used by the organization.
    return readNamedOptions('programTypes', []);
}

function listProgramTypes(): ProgramType[] {
    requireUser();
    return readProgramTypes().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createProgramType(input: CreateNamedOptionInput, requestId: string): ProgramType {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-type:create', requestId, () => {
        const options = readProgramTypes();
        if (options.some((option) => option.Name === name)) {
            throw new ValidationError('A program type with this name already exists.');
        }
        const created: ProgramType = { Name: name, Color: String(input.color || '').trim() };
        options.push(created);
        writeNamedOptions('programTypes', options);
        return created;
    });
    return result;
}

function updateProgramType(
    name: string,
    input: CreateNamedOptionInput,
    requestId: string,
): ProgramType {
    requireAdmin();
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-type:update', requestId, () => {
        const options = readProgramTypes();
        const existing = options.find((option) => option.Name === name);
        if (!existing) throw new ValidationError('not_found');
        if (newName !== name && options.some((option) => option.Name === newName)) {
            throw new ValidationError('A program type with this name already exists.');
        }
        existing.Name = newName;
        existing.Color = String(input.color || '').trim();
        writeNamedOptions('programTypes', options);
        return existing;
    });
    return result;
}

function deleteProgramType(name: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('program-type:delete', requestId, () => {
        writeNamedOptions(
            'programTypes',
            readProgramTypes().filter((option) => option.Name !== name),
        );
        return null;
    });
}

function readProgramLanguages(): ProgramLanguage[] {
    return readNamedOptions('programLanguages', DEFAULT_PROGRAM_LANGUAGES);
}

function listProgramLanguages(): ProgramLanguage[] {
    requireUser();
    return readProgramLanguages().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createProgramLanguage(input: CreateNamedOptionInput, requestId: string): ProgramLanguage {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-language:create', requestId, () => {
        const options = readProgramLanguages();
        if (options.some((option) => option.Name === name)) {
            throw new ValidationError('A language with this name already exists.');
        }
        const created: ProgramLanguage = { Name: name };
        options.push(created);
        writeNamedOptions('programLanguages', options);
        return created;
    });
    return result;
}

function updateProgramLanguage(
    name: string,
    input: CreateNamedOptionInput,
    requestId: string,
): ProgramLanguage {
    requireAdmin();
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-language:update', requestId, () => {
        const options = readProgramLanguages();
        const existing = options.find((option) => option.Name === name);
        if (!existing) throw new ValidationError('not_found');
        if (newName !== name && options.some((option) => option.Name === newName)) {
            throw new ValidationError('A language with this name already exists.');
        }
        existing.Name = newName;
        writeNamedOptions('programLanguages', options);
        return existing;
    });
    return result;
}

function deleteProgramLanguage(name: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('program-language:delete', requestId, () => {
        writeNamedOptions(
            'programLanguages',
            readProgramLanguages().filter((option) => option.Name !== name),
        );
        return null;
    });
}

function readSessionTypes(): SessionType[] {
    return readNamedOptions('sessionTypes', DEFAULT_SESSION_TYPES);
}

function listSessionTypes(): SessionType[] {
    requireUser();
    return readSessionTypes().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createSessionType(input: CreateNamedOptionInput, requestId: string): SessionType {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('session-type:create', requestId, () => {
        const options = readSessionTypes();
        if (options.some((option) => option.Name === name)) {
            throw new ValidationError('A session type with this name already exists.');
        }
        const created: SessionType = { Name: name };
        options.push(created);
        writeNamedOptions('sessionTypes', options);
        return created;
    });
    return result;
}

function updateSessionType(
    name: string,
    input: CreateNamedOptionInput,
    requestId: string,
): SessionType {
    requireAdmin();
    const newName = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('session-type:update', requestId, () => {
        const options = readSessionTypes();
        const existing = options.find((option) => option.Name === name);
        if (!existing) throw new ValidationError('not_found');
        if (newName !== name && options.some((option) => option.Name === newName)) {
            throw new ValidationError('A session type with this name already exists.');
        }
        existing.Name = newName;
        writeNamedOptions('sessionTypes', options);
        return existing;
    });
    return result;
}

function deleteSessionType(name: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('session-type:delete', requestId, () => {
        writeNamedOptions(
            'sessionTypes',
            readSessionTypes().filter((option) => option.Name !== name),
        );
        return null;
    });
}

function getSettings(): SettingsPayload {
    requireUser();
    const settings = readHomeContent();
    return {
        guidelines: settings.Guidelines,
        shiftTypes: readShiftTypes().sort((a, b) => a.Name.localeCompare(b.Name)),
        programTypes: readProgramTypes().sort((a, b) => a.Name.localeCompare(b.Name)),
        programLanguages: readProgramLanguages().sort((a, b) => a.Name.localeCompare(b.Name)),
        sessionTypes: readSessionTypes().sort((a, b) => a.Name.localeCompare(b.Name)),
    };
}

function cleanBlockInput(input: CreateBlockInput): Omit<Block, 'Id'> {
    const name = requireNonEmpty(input.name, 'Name is required.');
    const startDateTime = requireNonEmpty(input.startDateTime, 'Start is required.');
    const endDateTime = requireNonEmpty(input.endDateTime, 'End is required.');
    if (endDateTime <= startDateTime) throw new ValidationError('Block end must be after start.');
    const place = String(input.place || '');
    if (place && !Tables.Places.findById(place)) throw new ValidationError('place_not_found');
    return { Name: name, StartDateTime: startDateTime, EndDateTime: endDateTime, Place: place };
}

function listBlocks(): Block[] {
    requireApprover();
    return Tables.Blocks.readAll().sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime));
}

function createBlock(input: CreateBlockInput, requestId: string): Block {
    requireApprover();
    const block = cleanBlockInput(input);
    const { result } = withLockedDedupe('block:create', requestId, () =>
        Tables.Blocks.insert(block),
    );
    return result;
}

function updateBlock(id: string, input: CreateBlockInput, requestId: string): Block {
    requireApprover();
    const block = cleanBlockInput(input);
    const { result } = withLockedDedupe('block:update:' + id, requestId, () => {
        if (!Tables.Blocks.findById(id)) throw new ValidationError('not_found');
        return Tables.Blocks.updateById(id, block);
    });
    return result;
}

function deleteBlock(id: string, requestId: string): void {
    requireApprover();
    withLockedDedupe('block:delete:' + id, requestId, () => {
        Tables.Blocks.deleteById(id);
        return null;
    });
}

// Home content is just a handful of settings rows, keyed by field name
// (see SettingRow in shared/types.d.ts).
function readHomeContent(): HomeContent {
    const settingsById = indexBy(Tables.Settings.readAll(), (s) => s.Id);
    return {
        Guidelines: settingsById['Guidelines'] ? settingsById['Guidelines'].Value : '',
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
        upsertSetting('Guidelines', input.guidelines || '');
        return readHomeContent();
    });
}
