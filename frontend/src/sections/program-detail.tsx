import { useEffect, useState, type FormEvent } from 'react';
import { useApiQuery, useCreate } from '../ui/resources';
import {
    useDepartments,
    usePlaces,
    useProgramLanguages,
    useProgramTypes,
    useSessionTypes,
    useUsers,
} from '../ui/reference';
import { Input, Select, Field } from '../ui/form-kit';
import { Button, Empty, Space, Typography, Table } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { useNavigate } from 'react-router-dom';
import { programRequestPath, programsPath } from '../paths';
import { api } from '../api';
import { instantToLocalInput, localInputToInstant } from '../ui/date';
import { formatProgramSessionSchedule } from '../ui/format';
import {
    buildDuplicateProgramInput,
    canRescheduleProgram,
    getLocalDateFromSession,
    removeSession,
    shiftProgramSessions,
    upsertSession,
} from '../ui/program-actions';
import { DetailSection } from '../ui/detail-layout';
import { TableView } from '../ui/table-view';
import { AppLoading } from '../ui/app-loading';
import {
    buildProgramUpdate,
    programFormValues,
    toProgramSessionInputs,
    type ProgramFormValues,
} from '../ui/request-fields';
import { DetailLayout } from './detail-shared';
import { RequestDetailFrame } from './request-detail-frame';
import { useRequestDetail, type RequestDetailKind } from './use-request-detail';
import {
    defaultSessionDraft,
    OTHER_PROGRAM_TYPE,
    programTypeOptions,
    requesterOptionLabel,
} from './requests';
import { ActionConfirmation } from './action-confirmation';
import { SaveFooter, Submit, TextField } from './form-fields';
import { useSave } from './save-hooks';
import { showErrorAlert, withSavingBadge } from '../ui/feedback';

const error = (value: unknown) => showErrorAlert(value);

function formatProgramName(language: string, type: string, title: string): string {
    return [language, type.toLowerCase() === OTHER_PROGRAM_TYPE.toLowerCase() ? '' : type, title]
        .filter(Boolean)
        .join(' ');
}

const programKind: RequestDetailKind<ProgramRequestDTO, ProgramFormValues> = {
    policy: 'program',
    resource: 'program-requests',
    listPath: programsPath,
    listLabel: 'Programs',
    noun: 'program',
    deleteSubject: 'program request',
    numberPrefix: 'PRG',
    perform: (id, action) =>
        api.performProgramRequestAction(id, action as ProgramRequestAction, ''),
    saveParticipants: (id, participants) =>
        api.updateProgramRequestParticipants(id, { participants }),
    formValues: programFormValues,
    formUpdate: (request, values) => buildProgramUpdate(request, { values }),
};

export function ProgramDetail({ request }: { request: ProgramRequestDTO }) {
    const navigate = useNavigate();
    const places = usePlaces();
    const departments = useDepartments();
    const programLanguages = useProgramLanguages();
    const programTypes = useProgramTypes();
    const sessionTypes = useSessionTypes();
    const users = useUsers();
    const { mutateAsync: createProgramRequest } = useCreate();
    const detail = useRequestDetail(programKind, request);
    const { me, approver, permissions, form } = detail;
    const editable = permissions.canEdit;
    const sessions = request.sessions;
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [sessionTypeError, setSessionTypeError] = useState(false);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [duplicateDate, setDuplicateDate] = useState('');
    const [duplicateBusy, setDuplicateBusy] = useState(false);
    const [duplicateError, setDuplicateError] = useState('');
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>(() =>
        defaultSessionDraft(request.sessions),
    );
    const [rescheduleDate, setRescheduleDate] = useState('');
    // The places free for these sessions; asked again whenever the sessions change.
    const availablePlaces = useApiQuery(
        'getAvailablePlaces',
        request.Id,
        toProgramSessionInputs(sessions),
    );
    useEffect(() => {
        if (availablePlaces.error) error(availablePlaces.error);
    }, [availablePlaces.error]);
    const availablePlacesLoading = availablePlaces.isFetching;
    const availablePlaceIds = (availablePlaces.data ?? []).map((place) => place.Id);
    const placeOptions = places.filter((place) => availablePlaceIds.includes(place.Id));
    const persistSessions = async (
        change: (sessions: ProgramSession[]) => ProgramSession[],
    ): Promise<void> => {
        try {
            await detail.persist((latest) =>
                buildProgramUpdate(latest, { sessions: change(latest.sessions) }),
            );
        } catch (e) {
            error(e);
        }
    };
    const openDuplicate = () => {
        setDuplicateError('');
        setDuplicateDate(sessions.length ? getLocalDateFromSession(sessions[0].StartDateTime) : '');
        setDuplicateOpen(true);
    };
    const duplicate = async (event?: FormEvent) => {
        event?.preventDefault();
        setDuplicateError('');
        if (event) {
            const duplicateForm = event.currentTarget as HTMLFormElement;
            if (!duplicateForm.checkValidity()) {
                duplicateForm.reportValidity();
                return;
            }
        }
        setDuplicateBusy(true);
        setDuplicateOpen(false);
        setDuplicating(true);
        try {
            const nextSessions =
                sessions.length && duplicateDate
                    ? shiftProgramSessions(sessions, duplicateDate)
                    : sessions;
            const created = await withSavingBadge(() =>
                createProgramRequest({
                    resource: 'program-requests',
                    values: buildDuplicateProgramInput(request, me.Email, nextSessions),
                }),
            );
            navigate(programRequestPath((created.data as unknown as { Id: string }).Id));
        } catch (e) {
            setDuplicateError(e instanceof Error ? e.message : String(e));
            setDuplicating(false);
            setDuplicateOpen(true);
        } finally {
            setDuplicateBusy(false);
        }
    };
    const rescheduleSave = useSave(
        async () => {
            if (!rescheduleDate) throw new Error('Select a new first session date.');
            await detail.write((latest) =>
                buildProgramUpdate(latest, {
                    sessions: shiftProgramSessions(latest.sessions, rescheduleDate),
                }),
            );
        },
        () => setRescheduling(false),
    );
    const editSession = (index: number | null) => {
        setSessionIndex(index);
        setSessionTypeError(false);
        setSessionDraft(
            index === null
                ? defaultSessionDraft(sessions)
                : {
                      ...sessions[index],
                      StartDateTime: instantToLocalInput(sessions[index].StartDateTime),
                      EndDateTime: instantToLocalInput(sessions[index].EndDateTime),
                  },
        );
        setSessionOpen(true);
    };
    const saveSession = async (event: FormEvent) => {
        event.preventDefault();
        const sessionForm = event.currentTarget as HTMLFormElement;
        if (!sessionDraft.Type) {
            setSessionTypeError(true);
            return;
        }
        if (!sessionForm.checkValidity()) {
            sessionForm.reportValidity();
            return;
        }
        const endInput = sessionForm.elements.namedItem('endDateTime') as HTMLInputElement | null;
        if (new Date(sessionDraft.EndDateTime) <= new Date(sessionDraft.StartDateTime)) {
            endInput?.setCustomValidity('The end date must be after the start date.');
            endInput?.reportValidity();
            return;
        }
        endInput?.setCustomValidity('');
        setSessionTypeError(false);
        const savedDraft = {
            ...sessionDraft,
            StartDateTime: localInputToInstant(sessionDraft.StartDateTime),
            EndDateTime: localInputToInstant(sessionDraft.EndDateTime),
        };
        const index = sessionIndex;
        setSessionIndex(null);
        setSessionOpen(false);
        await persistSessions((current) => upsertSession(current, index, savedDraft));
    };
    const sessionRows = sessions.map((session, index) => ({
        ...session,
        key: `${session.StartDateTime}-${index}`,
    }));
    const sessionColumns = [
        {
            title: 'Schedule',
            key: 'schedule',
            render: (_value: unknown, session: ProgramSession) =>
                formatProgramSessionSchedule(session.StartDateTime, session.EndDateTime),
        },
        { title: 'Type', dataIndex: 'Type', key: 'Type' },
        { title: 'Title', dataIndex: 'Name', key: 'Name' },
        {
            title: 'Actions',
            key: 'actions',
            align: 'right' as const,
            render: (_value: unknown, _session: ProgramSession, index: number) =>
                editable ? (
                    <Space>
                        <Button
                            type="text"
                            icon={<Icon name="edit" />}
                            onClick={() => editSession(index)}
                            aria-label="Edit session"
                        />
                        <Button
                            type="text"
                            danger
                            icon={<Icon name="trash" />}
                            onClick={() => setPendingDeleteSessionIndex(index)}
                            aria-label="Delete session"
                        />
                    </Space>
                ) : null,
        },
    ];
    const programTitle =
        formatProgramName(request.Language, request.Type, request.Name) || 'Unnamed program';
    if (duplicating) {
        return (
            <DetailLayout title={programTitle}>
                <AppLoading inline />
            </DetailLayout>
        );
    }
    const formValues = form.values;
    return (
        <RequestDetailFrame
            request={request}
            detail={detail}
            title={programTitle}
            editDisabled={approver && availablePlacesLoading}
            fields={[
                ['Program title', request.Name],
                ['Language', request.Language],
                ['Type', request.Type],
                ['Place', request.placeName || 'None'],
            ]}
            headerExtra={
                <>
                    {request.Status !== 'draft' && (
                        <Button
                            aria-label="Duplicate program"
                            title="Duplicate program"
                            onClick={openDuplicate}>
                            Duplicate
                        </Button>
                    )}
                    {sessions.length > 0 && canRescheduleProgram(request, me) && (
                        <Button
                            onClick={() => {
                                setRescheduleDate(
                                    getLocalDateFromSession(sessions[0].StartDateTime),
                                );
                                setRescheduling(true);
                            }}>
                            Reschedule
                        </Button>
                    )}
                </>
            }
            modals={
                <>
                    {pendingDeleteSessionIndex !== null && (
                        <ActionConfirmation
                            action="delete"
                            description="Are you sure you want to delete this session?"
                            onCancel={() => setPendingDeleteSessionIndex(null)}
                            onConfirm={async () => {
                                await persistSessions((current) =>
                                    removeSession(current, pendingDeleteSessionIndex),
                                );
                                setPendingDeleteSessionIndex(null);
                            }}
                        />
                    )}
                    {formValues && (
                        <Modal title="Edit program" close={form.close}>
                            <form className="grid gap-3" noValidate onSubmit={form.save.run}>
                                <Field label="Language" required>
                                    <input
                                        type="hidden"
                                        name="language"
                                        value={formValues.Language}
                                        required
                                    />
                                    <Select
                                        value={formValues.Language || undefined}
                                        onChange={(value) => form.update('Language', value)}
                                        className="w-full"
                                        placeholder="Select language">
                                        {programLanguages.map((language) => (
                                            <Select.Option
                                                key={language.Name}
                                                value={language.Name}>
                                                {language.Name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Field>
                                <TextField
                                    name="name"
                                    label="Program title"
                                    value={formValues.Name}
                                    required={formValues.Type === OTHER_PROGRAM_TYPE}
                                    onChange={(e) => form.update('Name', e.target.value)}
                                />
                                <Field label="Type" required>
                                    <input type="hidden" name="type" value={formValues.Type} />
                                    <Select
                                        value={formValues.Type}
                                        onChange={(value) => form.update('Type', value)}
                                        className="w-full">
                                        {programTypeOptions(programTypes, formValues.Type).map(
                                            (type) => (
                                                <Select.Option key={type} value={type}>
                                                    {type}
                                                </Select.Option>
                                            ),
                                        )}
                                    </Select>
                                </Field>
                                <Field label="Place">
                                    <Select
                                        value={formValues.PlaceId}
                                        onChange={(value) => form.update('PlaceId', value)}
                                        disabled={!approver}
                                        loading={availablePlacesLoading}
                                        className="w-full">
                                        <Select.Option value="">No place</Select.Option>
                                        {placeOptions.map((p) => (
                                            <Select.Option key={p.Id} value={p.Id}>
                                                {p.Name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Field>
                                {approver && (
                                    <Field label="Requested by" required>
                                        <input
                                            type="hidden"
                                            name="userId"
                                            value={formValues.UserId}
                                            required
                                        />
                                        <Select
                                            value={formValues.UserId}
                                            onChange={(value) => form.update('UserId', value)}
                                            className="w-full"
                                            showSearch>
                                            {users.map((u) => (
                                                <Select.Option key={u.Email} value={u.Email}>
                                                    {requesterOptionLabel(u)}
                                                </Select.Option>
                                            ))}
                                        </Select>
                                    </Field>
                                )}
                                <Field label="Department" required>
                                    <input
                                        type="hidden"
                                        name="departmentId"
                                        value={formValues.DepartmentId}
                                        required
                                    />
                                    <Select
                                        value={formValues.DepartmentId}
                                        onChange={(value) => form.update('DepartmentId', value)}
                                        className="w-full"
                                        showSearch>
                                        {departments.map((d) => (
                                            <Select.Option key={d.Id} value={d.Id}>
                                                {d.Name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Field>
                                <TextField
                                    name="leadEmail"
                                    label="Lead email"
                                    type="email"
                                    value={formValues.LeadEmail}
                                    required
                                    onChange={(e) => form.update('LeadEmail', e.target.value)}
                                />
                                <div>
                                    <SaveFooter
                                        label="Save"
                                        busy={form.save.busy}
                                        errorMessage={form.save.errorMessage}
                                    />
                                </div>
                            </form>
                        </Modal>
                    )}
                    {rescheduling && (
                        <Modal title="Reschedule program" close={() => setRescheduling(false)}>
                            <form className="grid gap-3" noValidate onSubmit={rescheduleSave.run}>
                                <Typography.Text type="secondary">
                                    Moves every session together, keeping the gaps between them, so
                                    the first session starts on this date.
                                </Typography.Text>
                                <TextField
                                    name="firstSessionDate"
                                    label="First session date"
                                    type="date"
                                    value={rescheduleDate}
                                    required
                                    onChange={(event) => setRescheduleDate(event.target.value)}
                                />
                                <SaveFooter
                                    label="Save"
                                    busy={rescheduleSave.busy}
                                    errorMessage={rescheduleSave.errorMessage}
                                />
                            </form>
                        </Modal>
                    )}
                    {duplicateOpen && (
                        <Modal title="Duplicate program" close={() => setDuplicateOpen(false)}>
                            <form className="grid gap-3" noValidate onSubmit={duplicate}>
                                {sessions.length > 0 ? (
                                    <>
                                        <Typography.Text type="secondary">
                                            The copy keeps the same sessions, moved together so the
                                            first session starts on this date.
                                        </Typography.Text>
                                        <TextField
                                            name="duplicateFirstSessionDate"
                                            label="First session date"
                                            type="date"
                                            value={duplicateDate}
                                            required
                                            onChange={(event) =>
                                                setDuplicateDate(event.target.value)
                                            }
                                        />
                                    </>
                                ) : (
                                    <Typography.Text type="secondary">
                                        This program has no sessions to schedule.
                                    </Typography.Text>
                                )}
                                <SaveFooter
                                    label="Duplicate"
                                    busy={duplicateBusy}
                                    errorMessage={duplicateError}
                                />
                            </form>
                        </Modal>
                    )}
                    {sessionOpen && (
                        <Modal
                            title={sessionIndex === null ? 'Add session' : 'Edit session'}
                            close={() => {
                                setSessionOpen(false);
                                setSessionIndex(null);
                            }}>
                            <SessionForm
                                draft={sessionDraft}
                                setDraft={setSessionDraft}
                                types={sessionTypes}
                                typeError={sessionTypeError}
                                clearTypeError={() => setSessionTypeError(false)}
                                onSubmit={saveSession}
                            />
                        </Modal>
                    )}
                </>
            }>
            <DetailSection className="table-detail-section">
                <TableView
                    title="Sessions"
                    count={sessions.length}
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<Icon name="plus" />}
                                onClick={() => editSession(null)}
                                aria-label="Add session"
                                title="Add session"
                            />
                        )
                    }>
                    {sessions.length ? (
                        <Table
                            rowKey="key"
                            columns={sessionColumns}
                            dataSource={sessionRows}
                            pagination={false}
                            className="sessions-table"
                            scroll={{ x: 'max-content' }}
                        />
                    ) : (
                        <Empty>No sessions added.</Empty>
                    )}
                </TableView>
            </DetailSection>
        </RequestDetailFrame>
    );
}

function SessionForm({
    draft,
    setDraft,
    types,
    typeError,
    clearTypeError,
    onSubmit,
}: {
    draft: ProgramSession;
    setDraft: (value: ProgramSession) => void;
    types: SessionType[];
    typeError: boolean;
    clearTypeError: () => void;
    onSubmit: (event: FormEvent) => void;
}) {
    const update = (key: keyof ProgramSession, value: string) =>
        setDraft({ ...draft, [key]: value });
    return (
        <form className="grid gap-3" noValidate onSubmit={onSubmit}>
            <Field label="Session type" required>
                <Select
                    value={draft.Type}
                    onChange={(value) => {
                        update('Type', value);
                        clearTypeError();
                    }}
                    status={typeError ? 'error' : undefined}
                    className="w-full">
                    <Select.Option value="" disabled>
                        Select type
                    </Select.Option>
                    {types.map((t) => (
                        <Select.Option key={t.Name} value={t.Name}>
                            {t.Name}
                        </Select.Option>
                    ))}
                </Select>
            </Field>
            <Field label="Session title">
                <Input value={draft.Name} onChange={(e) => update('Name', e.target.value)} />
            </Field>
            <TextField
                name="startDateTime"
                label="Start"
                type="datetime-local"
                value={draft.StartDateTime ? draft.StartDateTime.slice(0, 16) : ''}
                onChange={(e) => update('StartDateTime', e.target.value)}
                required
            />
            <TextField
                name="endDateTime"
                label="End"
                type="datetime-local"
                value={draft.EndDateTime ? draft.EndDateTime.slice(0, 16) : ''}
                onChange={(e) => {
                    e.currentTarget.setCustomValidity('');
                    update('EndDateTime', e.target.value);
                }}
                required
            />
            <div>
                <Submit label="Save" />
            </div>
        </form>
    );
}
