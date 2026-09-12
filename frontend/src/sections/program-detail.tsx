import { useEffect, useState, type FormEvent } from 'react';
import {
    useCreate,
    useCustomMutation,
    useDelete,
    useInvalidate,
    useList,
    useUpdate,
} from '@refinedev/core';
import { Button, Form as AntForm, Input, Select, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../dashboard-context';
import { programRequestPath, programsPath } from '../paths';
import { api } from '../api';
import { generateRequestId } from '../ids';
import { formatProgramSessionSchedule } from '../ui/format';
import {
    buildDuplicateProgramInput,
    canRescheduleProgram,
    getLocalDateFromSession,
    getProgramRequestActions,
    shiftProgramSessions,
} from '../ui/program-actions';
import { canApprove } from '../workflows';
import { DetailSection } from '../ui/detail-layout';
import { TableView } from '../ui/table-view';
import { AppLoading } from '../ui/app-loading';
import { Table } from 'antd';
import { Activity, ParticipantsEditor } from './detail-activity';
import { DetailFields, DetailLayout, WorkflowActions } from './detail-shared';
import {
    defaultSessionDraft,
    OTHER_PROGRAM_TYPE,
    PROGRAM_REQUEST_STATUSES,
    programTypeOptions,
    requesterOptionLabel,
} from './requests';
import {
    ActionConfirmation,
    Empty,
    Modal,
    SaveFooter,
    Submit,
    TextField,
    useSave,
} from './refine-shared';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';

const error = (value: unknown) => showErrorAlert(value);

function formatProgramName(language: string, type: string, title: string): string {
    return [language, type.toLowerCase() === OTHER_PROGRAM_TYPE.toLowerCase() ? '' : type, title]
        .filter(Boolean)
        .join(' ');
}

export function ProgramDetail({
    request,
    dashboard,
}: {
    request: ProgramRequestDTO;
    dashboard: DashboardPayload;
}) {
    const navigate = useNavigate();
    const { refreshDashboard } = useDashboard();
    const { mutateAsync: updateProgramRequest } = useUpdate();
    const { mutateAsync: createProgramRequest } = useCreate();
    const { mutateAsync: deleteProgramRequest } = useDelete();
    const { mutateAsync: customMutate } = useCustomMutation();
    const invalidate = useInvalidate();
    const invalidateThisRequest = () =>
        invalidate({
            resource: 'program-requests',
            id: request.Id,
            invalidates: ['list', 'many', 'detail'],
        });
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const deletable =
        ['draft', 'cancelled', 'rejected'].includes(request.Status) &&
        (canApprove(dashboard.me) || owner);
    const [editing, setEditing] = useState(false);
    const [sessions, setSessions] = useState<ProgramSession[]>(request.sessions);
    const [sessionIndex, setSessionIndex] = useState<number | null>(null);
    const [sessionOpen, setSessionOpen] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [sessionTypeError, setSessionTypeError] = useState(false);
    const [pendingAction, setPendingAction] = useState<ProgramRequestAction | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [pendingDeleteSessionIndex, setPendingDeleteSessionIndex] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [duplicateDate, setDuplicateDate] = useState('');
    const [duplicateBusy, setDuplicateBusy] = useState(false);
    const [duplicateError, setDuplicateError] = useState('');
    const [sessionDraft, setSessionDraft] = useState<ProgramSession>(() =>
        defaultSessionDraft(request.sessions),
    );
    const [rescheduleDate, setRescheduleDate] = useState(() =>
        request.sessions.length ? getLocalDateFromSession(request.sessions[0].StartDateTime) : '',
    );
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canApprove(dashboard.me) },
    });
    const users = usersResult.data;
    const [values, setValues] = useState({
        Name: request.Name,
        Language: request.Language,
        Type: request.Type,
        PlaceId: request.PlaceId,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
        Status: request.Status,
    });
    const [availablePlaceIds, setAvailablePlaceIds] = useState<string[]>([]);
    const [availablePlacesLoading, setAvailablePlacesLoading] = useState(true);
    useEffect(() => {
        setAvailablePlacesLoading(true);
        setAvailablePlaceIds([]);
        api.getAvailablePlaces(
            request.Id,
            sessions.map((session) => ({
                name: session.Name,
                type: session.Type,
                startDateTime: session.StartDateTime,
                endDateTime: session.EndDateTime,
            })),
        )
            .then((places) => setAvailablePlaceIds(places.map((place) => place.Id)))
            .catch(error)
            .finally(() => setAvailablePlacesLoading(false));
    }, [request.Id, sessions]);
    const availablePlaceOptions = dashboard.places.filter((place) =>
        availablePlaceIds.includes(place.Id),
    );
    const placeOptions = availablePlaceOptions;
    const persistSessions = async (nextSessions: ProgramSession[]) => {
        try {
            showSavingBadge(true);
            await updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
            setSessions(nextSessions);
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const save = useSave(
        () => {
            if (!values.Language) throw new Error('Language is required.');
            if (!values.Type) throw new Error('Type is required.');
            if (!values.Status) throw new Error('Status is required.');
            if (!values.UserId) throw new Error('Requested by is required.');
            if (!values.DepartmentId) throw new Error('Department is required.');
            return updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: sessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            }).catch((e) => {
                setValues({
                    Name: request.Name,
                    Language: request.Language,
                    Type: request.Type,
                    PlaceId: request.PlaceId,
                    DepartmentId: request.DepartmentId,
                    LeadEmail: request.LeadEmail,
                    Participants: request.participants.join(', '),
                    UserId: request.UserId,
                    Status: request.Status,
                });
                setSessions(request.sessions);
                throw e;
            });
        },
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await customMutate({
                url: 'updateProgramRequestParticipants',
                method: 'post',
                values: {},
                meta: {
                    operation: 'updateProgramRequestParticipants',
                    args: [request.Id, { participants: serialized }, generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            setValues((current) => ({ ...current, Participants: serialized }));
            await invalidateThisRequest();
            await refreshDashboard();
        } finally {
            showSavingBadge(false);
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
            const form = event.currentTarget as HTMLFormElement;
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
        }
        setDuplicateBusy(true);
        setDuplicateOpen(false);
        setDuplicating(true);
        try {
            showSavingBadge(true);
            const nextSessions =
                sessions.length && duplicateDate
                    ? shiftProgramSessions(sessions, duplicateDate)
                    : sessions;
            const created = await createProgramRequest({
                resource: 'program-requests',
                values: buildDuplicateProgramInput(request, dashboard.me.Email, nextSessions),
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
            navigate(programRequestPath((created.data as unknown as { Id: string }).Id));
        } catch (e) {
            setDuplicateError(e instanceof Error ? e.message : String(e));
            setDuplicating(false);
            setDuplicateOpen(true);
        } finally {
            setDuplicateBusy(false);
            showSavingBadge(false);
        }
    };
    const rescheduleSave = useSave(
        async () => {
            if (!rescheduleDate) throw new Error('Select a new first session date.');
            const nextSessions = shiftProgramSessions(sessions, rescheduleDate);
            await updateProgramRequest({
                resource: 'program-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    language: values.Language,
                    type: values.Type,
                    userId: values.UserId,
                    placeId: values.PlaceId,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    status: values.Status,
                    sessions: nextSessions.map((s) => ({
                        name: s.Name,
                        type: s.Type,
                        startDateTime: s.StartDateTime,
                        endDateTime: s.EndDateTime,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
            setSessions(nextSessions);
        },
        () => setRescheduling(false),
    );
    const editSession = (index: number | null) => {
        setSessionIndex(index);
        setSessionTypeError(false);
        setSessionDraft(index === null ? defaultSessionDraft(sessions) : { ...sessions[index] });
        setSessionOpen(true);
    };
    const saveSession = async (event: FormEvent) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        if (!sessionDraft.Type) {
            setSessionTypeError(true);
            return;
        }
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        if (new Date(sessionDraft.EndDateTime) <= new Date(sessionDraft.StartDateTime)) {
            const endInput = form.elements.namedItem('endDateTime') as HTMLInputElement | null;
            endInput?.setCustomValidity('The end date must be after the start date.');
            endInput?.reportValidity();
            return;
        }
        const endInput = form.elements.namedItem('endDateTime') as HTMLInputElement | null;
        endInput?.setCustomValidity('');
        setSessionTypeError(false);
        const nextSessions =
            sessionIndex === null
                ? [...sessions, sessionDraft]
                : sessions.map((s, i) => (i === sessionIndex ? sessionDraft : s));
        setSessionIndex(null);
        setSessionOpen(false);
        await persistSessions(nextSessions);
    };
    const perform = async (action: ProgramRequestAction) => {
        try {
            showSavingBadge(true);
            await customMutate({
                url: 'performProgramRequestAction',
                method: 'post',
                values: {},
                meta: {
                    operation: 'performProgramRequestAction',
                    args: [request.Id, action, '', generateRequestId()],
                },
                successNotification: false,
                errorNotification: false,
            });
            await invalidateThisRequest();
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            showSavingBadge(false);
        }
    };
    const update = (key: keyof typeof values, value: string) =>
        setValues((current) => ({ ...current, [key]: value }));
    const actions = getProgramRequestActions(request, dashboard.me);
    const needsAllocation =
        canApprove(dashboard.me) && request.Status === 'submitted' && !request.PlaceId;
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
                            icon={<EditOutlined />}
                            onClick={() => editSession(index)}
                            aria-label="Edit session"
                        />
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
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
    return (
        <DetailLayout
            title={programTitle}
            action={
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate(programsPath)}
                        aria-label="Back to programs"
                        title="Back to programs"
                    />
                    {request.Status !== 'draft' && (
                        <Button
                            aria-label="Duplicate program"
                            title="Duplicate program"
                            onClick={openDuplicate}>
                            Duplicate
                        </Button>
                    )}
                    {sessions.length > 0 && canRescheduleProgram(request, dashboard.me) && (
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
                    {actions.length > 0 && (
                        <WorkflowActions
                            actions={actions}
                            onAction={(action) => setPendingAction(action as ProgramRequestAction)}
                        />
                    )}
                    {needsAllocation && (
                        <Button
                            type="primary"
                            disabled={canApprove(dashboard.me) && availablePlacesLoading}
                            onClick={() => setEditing(true)}>
                            Allocate
                        </Button>
                    )}
                    {deletable && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setPendingDelete(true)}
                            aria-label="Delete program"
                            title="Delete program"
                        />
                    )}
                </Space>
            }>
            <DetailSection
                title="Details"
                action={
                    editable && (
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            disabled={canApprove(dashboard.me) && availablePlacesLoading}
                            onClick={() => setEditing(true)}
                            aria-label="Edit program"
                            title="Edit program"
                        />
                    )
                }>
                <DetailFields
                    fields={[
                        ['Request number', `PRG-${request.DisplayId}`],
                        [
                            'Status',
                            <Tag color="blue" key="status">
                                {request.Status}
                            </Tag>,
                        ],
                        ['Program title', request.Name],
                        ['Language', request.Language],
                        ['Type', request.Type],
                        ['Place', request.placeName || 'None'],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', request.LeadEmail],
                        ['Requested by', request.userName],
                        [
                            'Participants',
                            <ParticipantsEditor
                                participants={
                                    values.Participants ? values.Participants.split(',') : []
                                }
                                editable={canApprove(dashboard.me) || owner}
                                onSave={saveParticipants}
                            />,
                        ],
                    ]}
                />
            </DetailSection>
            <DetailSection className="table-detail-section">
                <TableView
                    title="Sessions"
                    count={sessions.length}
                    action={
                        editable && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
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
            <DetailSection className="activity-detail-section">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {pendingAction && (
                <ActionConfirmation
                    action={pendingAction}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={async () => {
                        setPendingAction(null);
                        void perform(pendingAction);
                    }}
                />
            )}
            {pendingDelete && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this program request?"
                    onCancel={() => setPendingDelete(false)}
                    onConfirm={async () => {
                        try {
                            showSavingBadge(true);
                            await deleteProgramRequest({
                                resource: 'program-requests',
                                id: request.Id,
                                successNotification: false,
                                errorNotification: false,
                            });
                            setPendingDelete(false);
                            await refreshDashboard();
                            navigate(programsPath);
                        } catch (e) {
                            error(e);
                        } finally {
                            showSavingBadge(false);
                        }
                    }}
                />
            )}
            {pendingDeleteSessionIndex !== null && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this session?"
                    onCancel={() => setPendingDeleteSessionIndex(null)}
                    onConfirm={async () => {
                        const nextSessions = sessions.filter(
                            (_, i) => i !== pendingDeleteSessionIndex,
                        );
                        await persistSessions(nextSessions);
                        setPendingDeleteSessionIndex(null);
                    }}
                />
            )}
            {editing && (
                <Modal title="Edit program" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <AntForm.Item label="Language" required>
                            <input type="hidden" name="language" value={values.Language} required />
                            <Select
                                value={values.Language || undefined}
                                onChange={(value) => update('Language', value)}
                                className="antd-full-width"
                                placeholder="Select language">
                                {dashboard.programLanguages.map((language) => (
                                    <Select.Option key={language.Name} value={language.Name}>
                                        {language.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="name"
                            label="Program title"
                            value={values.Name}
                            required={values.Type === OTHER_PROGRAM_TYPE}
                            onChange={(e) => update('Name', e.target.value)}
                        />
                        <AntForm.Item label="Type" required>
                            <input type="hidden" name="type" value={values.Type} />
                            <Select
                                value={values.Type}
                                onChange={(value) => update('Type', value)}
                                className="antd-full-width">
                                {programTypeOptions(dashboard.programTypes, values.Type).map(
                                    (type) => (
                                        <Select.Option key={type} value={type}>
                                            {type}
                                        </Select.Option>
                                    ),
                                )}
                            </Select>
                        </AntForm.Item>
                        <AntForm.Item label="Status" required>
                            <Select
                                value={values.Status}
                                onChange={(value) => update('Status', value)}
                                disabled={!canApprove(dashboard.me)}
                                className="antd-full-width">
                                {PROGRAM_REQUEST_STATUSES.map((status) => (
                                    <Select.Option key={status} value={status}>
                                        {status}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <AntForm.Item label="Place">
                            <Select
                                value={values.PlaceId}
                                onChange={(value) => update('PlaceId', value)}
                                disabled={!canApprove(dashboard.me)}
                                loading={availablePlacesLoading}
                                className="antd-full-width">
                                <Select.Option value="">No place</Select.Option>
                                {placeOptions.map((p) => (
                                    <Select.Option key={p.Id} value={p.Id}>
                                        {p.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        {canApprove(dashboard.me) && (
                            <AntForm.Item label="Requested by" required>
                                <input type="hidden" name="userId" value={values.UserId} required />
                                <Select
                                    value={values.UserId}
                                    onChange={(value) => update('UserId', value)}
                                    className="antd-full-width">
                                    {users.map((u) => (
                                        <Select.Option key={u.Email} value={u.Email}>
                                            {requesterOptionLabel(u)}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </AntForm.Item>
                        )}
                        <AntForm.Item label="Department" required>
                            <input
                                type="hidden"
                                name="departmentId"
                                value={values.DepartmentId}
                                required
                            />
                            <Select
                                value={values.DepartmentId}
                                onChange={(value) => update('DepartmentId', value)}
                                className="antd-full-width">
                                {dashboard.departments.map((d) => (
                                    <Select.Option key={d.Id} value={d.Id}>
                                        {d.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </AntForm.Item>
                        <TextField
                            name="leadEmail"
                            label="Lead email"
                            type="email"
                            value={values.LeadEmail}
                            required
                            onChange={(e) => update('LeadEmail', e.target.value)}
                        />
                        <div>
                            <SaveFooter
                                label="Save"
                                busy={save.busy}
                                errorMessage={save.errorMessage}
                            />
                        </div>
                    </form>
                </Modal>
            )}
            {rescheduling && (
                <Modal title="Reschedule program" close={() => setRescheduling(false)}>
                    <form className="grid gap-3" noValidate onSubmit={rescheduleSave.run}>
                        <Typography.Text type="secondary">
                            Moves every session together, keeping the gaps between them, so the
                            first session starts on this date.
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
                                    The copy keeps the same sessions, moved together so the first
                                    session starts on this date.
                                </Typography.Text>
                                <TextField
                                    name="duplicateFirstSessionDate"
                                    label="First session date"
                                    type="date"
                                    value={duplicateDate}
                                    required
                                    onChange={(event) => setDuplicateDate(event.target.value)}
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
                        types={dashboard.sessionTypes}
                        typeError={sessionTypeError}
                        clearTypeError={() => setSessionTypeError(false)}
                        onSubmit={saveSession}
                    />
                </Modal>
            )}
        </DetailLayout>
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
            <AntForm.Item label="Session type" required>
                <Select
                    value={draft.Type}
                    onChange={(value) => {
                        update('Type', value);
                        clearTypeError();
                    }}
                    status={typeError ? 'error' : undefined}
                    className="antd-full-width">
                    <Select.Option value="" disabled>
                        Select type
                    </Select.Option>
                    {types.map((t) => (
                        <Select.Option key={t.Name} value={t.Name}>
                            {t.Name}
                        </Select.Option>
                    ))}
                </Select>
            </AntForm.Item>
            <AntForm.Item label="Session title">
                <Input value={draft.Name} onChange={(e) => update('Name', e.target.value)} />
            </AntForm.Item>
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
