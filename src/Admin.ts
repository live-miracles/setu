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
        return Tables.Places.updateById(id, { Name: name });
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

// Shift presets have no dedicated tab; they are a JSON-encoded array in one
// Settings row (Id 'shiftPresets').
function readShiftPresets(): ShiftPreset[] {
    const setting = Tables.Settings.findById('shiftPresets');
    if (!setting || !setting.Value) return [];
    try {
        return JSON.parse(setting.Value) as ShiftPreset[];
    } catch (err) {
        return [];
    }
}

function writeShiftPresets(presets: ShiftPreset[]): void {
    upsertSetting('shiftPresets', JSON.stringify(presets));
}

function listShiftPresets(): ShiftPreset[] {
    requireUser();
    return readShiftPresets().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createShiftPreset(input: CreateShiftPresetInput, requestId: string): ShiftPreset {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('shift-preset:create', requestId, () => {
        const created: ShiftPreset = {
            Id: Utilities.getUuid(),
            Name: name,
            DefaultStartTime: input.defaultStartTime || '',
            DefaultEndTime: input.defaultEndTime || '',
        };
        const presets = readShiftPresets();
        presets.push(created);
        writeShiftPresets(presets);
        return created;
    });
    return result;
}

function updateShiftPreset(
    id: string,
    input: CreateShiftPresetInput,
    requestId: string,
): ShiftPreset {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('shift-preset:update', requestId, () => {
        const presets = readShiftPresets();
        const existing = presets.find((p) => p.Id === id);
        if (!existing) throw new ValidationError('not_found');
        existing.Name = name;
        existing.DefaultStartTime = input.defaultStartTime || '';
        existing.DefaultEndTime = input.defaultEndTime || '';
        writeShiftPresets(presets);
        return existing;
    });
    return result;
}

function deleteShiftPreset(id: string, requestId: string): void {
    requireAdmin();
    withLockedDedupe('shift-preset:delete', requestId, () => {
        writeShiftPresets(readShiftPresets().filter((p) => p.Id !== id));
        return null;
    });
}

const DEFAULT_PROGRAM_TYPES: ProgramType[] = [
    { Id: 'program-type-livestream', Name: 'Livestream', Color: '' },
    { Id: 'program-type-recording', Name: 'Recording', Color: '' },
    { Id: 'program-type-webinar', Name: 'Webinar', Color: '' },
    { Id: 'program-type-meeting', Name: 'Meeting', Color: '' },
    { Id: 'program-type-visit', Name: 'Visit', Color: '' },
    { Id: 'program-type-other', Name: 'Other', Color: '' },
];

const DEFAULT_PROGRAM_LANGUAGES: ProgramLanguage[] = [
    { Id: 'program-language-english', Name: 'English' },
    { Id: 'program-language-hindi', Name: 'Hindi' },
    { Id: 'program-language-tamil', Name: 'Tamil' },
    { Id: 'program-language-telugu', Name: 'Telugu' },
    { Id: 'program-language-kannada', Name: 'Kannada' },
];

const DEFAULT_SESSION_TYPES: SessionType[] = [
    { Id: 'session-type-live', Name: 'Live' },
    { Id: 'session-type-dry-run', Name: 'Dry Run' },
    { Id: 'session-type-recording', Name: 'Recording' },
];

function readNamedOptions<T extends { Id: string; Name: string }>(key: string, fallback: T[]): T[] {
    const setting = Tables.Settings.findById(key);
    if (!setting || !setting.Value) return fallback.map((option) => Object.assign({}, option));
    try {
        return JSON.parse(setting.Value) as T[];
    } catch (err) {
        return fallback.map((option) => Object.assign({}, option));
    }
}

function writeNamedOptions(key: string, options: { Id: string; Name: string }[]): void {
    upsertSetting(key, JSON.stringify(options));
}

function createNamedOption<T extends { Id: string; Name: string }>(
    key: string,
    fallback: T[],
    input: CreateNamedOptionInput,
    requestId: string,
    lockKey: string,
): T {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe(lockKey + ':create', requestId, () => {
        const created = { Id: Utilities.getUuid(), Name: name } as T;
        const options = readNamedOptions(key, fallback);
        options.push(created);
        writeNamedOptions(key, options);
        return created;
    });
    return result;
}

function updateNamedOption<T extends { Id: string; Name: string }>(
    key: string,
    fallback: T[],
    id: string,
    input: CreateNamedOptionInput,
    requestId: string,
    lockKey: string,
): T {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe(lockKey + ':update', requestId, () => {
        const options = readNamedOptions(key, fallback);
        const existing = options.find((option) => option.Id === id);
        if (!existing) throw new ValidationError('not_found');
        existing.Name = name;
        writeNamedOptions(key, options);
        return existing;
    });
    return result;
}

function deleteNamedOption<T extends { Id: string; Name: string }>(
    key: string,
    fallback: T[],
    id: string,
    requestId: string,
    lockKey: string,
): void {
    requireAdmin();
    withLockedDedupe(lockKey + ':delete', requestId, () => {
        writeNamedOptions(
            key,
            readNamedOptions(key, fallback).filter((option) => option.Id !== id),
        );
        return null;
    });
}

function readProgramTypes(): ProgramType[] {
    return readNamedOptions('programTypes', DEFAULT_PROGRAM_TYPES);
}

function listProgramTypes(): ProgramType[] {
    requireUser();
    return readProgramTypes().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createProgramType(input: CreateNamedOptionInput, requestId: string): ProgramType {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-type:create', requestId, () => {
        const created: ProgramType = {
            Id: Utilities.getUuid(),
            Name: name,
            Color: String(input.color || '').trim(),
        };
        const options = readProgramTypes();
        options.push(created);
        writeNamedOptions('programTypes', options);
        return created;
    });
    return result;
}

function updateProgramType(
    id: string,
    input: CreateNamedOptionInput,
    requestId: string,
): ProgramType {
    requireAdmin();
    const name = requireNonEmpty(input.name, 'Name is required.');
    const { result } = withLockedDedupe('program-type:update', requestId, () => {
        const options = readProgramTypes();
        const existing = options.find((option) => option.Id === id);
        if (!existing) throw new ValidationError('not_found');
        existing.Name = name;
        existing.Color = String(input.color || '').trim();
        writeNamedOptions('programTypes', options);
        return existing;
    });
    return result;
}

function deleteProgramType(id: string, requestId: string): void {
    deleteNamedOption('programTypes', DEFAULT_PROGRAM_TYPES, id, requestId, 'program-type');
}

function readProgramLanguages(): ProgramLanguage[] {
    return readNamedOptions('programLanguages', DEFAULT_PROGRAM_LANGUAGES);
}

function listProgramLanguages(): ProgramLanguage[] {
    requireUser();
    return readProgramLanguages().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createProgramLanguage(input: CreateNamedOptionInput, requestId: string): ProgramLanguage {
    return createNamedOption(
        'programLanguages',
        DEFAULT_PROGRAM_LANGUAGES,
        input,
        requestId,
        'program-language',
    );
}

function updateProgramLanguage(
    id: string,
    input: CreateNamedOptionInput,
    requestId: string,
): ProgramLanguage {
    return updateNamedOption(
        'programLanguages',
        DEFAULT_PROGRAM_LANGUAGES,
        id,
        input,
        requestId,
        'program-language',
    );
}

function deleteProgramLanguage(id: string, requestId: string): void {
    deleteNamedOption(
        'programLanguages',
        DEFAULT_PROGRAM_LANGUAGES,
        id,
        requestId,
        'program-language',
    );
}

function readSessionTypes(): SessionType[] {
    return readNamedOptions('sessionTypes', DEFAULT_SESSION_TYPES);
}

function listSessionTypes(): SessionType[] {
    requireUser();
    return readSessionTypes().sort((a, b) => a.Name.localeCompare(b.Name));
}

function createSessionType(input: CreateNamedOptionInput, requestId: string): SessionType {
    return createNamedOption(
        'sessionTypes',
        DEFAULT_SESSION_TYPES,
        input,
        requestId,
        'session-type',
    );
}

function updateSessionType(
    id: string,
    input: CreateNamedOptionInput,
    requestId: string,
): SessionType {
    return updateNamedOption(
        'sessionTypes',
        DEFAULT_SESSION_TYPES,
        id,
        input,
        requestId,
        'session-type',
    );
}

function deleteSessionType(id: string, requestId: string): void {
    deleteNamedOption('sessionTypes', DEFAULT_SESSION_TYPES, id, requestId, 'session-type');
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
