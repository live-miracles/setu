import { useState } from 'react';
import { useCreate, useDelete, useList, useUpdate } from '@refinedev/core';
import { Button, Form as AntForm, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useDashboard } from '../dashboard-context';
import { formatLocalDateOnly } from '../ui/date';
import {
    buildRosterTableModel,
    formatRosterTableTimes,
    getShiftTypeTimes,
} from '../ui/roster-table';
import { canApprove } from '../workflows';
import {
    ActionConfirmation,
    Empty,
    Modal,
    Page,
    SaveFooter,
    TextField,
    useSave,
} from './refine-shared';

type Props = { dashboard: DashboardPayload };

export function Roster({ dashboard }: Props) {
    const { refreshDashboard } = useDashboard();
    const canEdit = canApprove(dashboard.me);
    const [editing, setEditing] = useState<RosterDTO>();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<RosterDTO | null>(null);
    const { mutateAsync: deleteRoster } = useDelete();
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canEdit },
    });
    const users = usersResult.data;
    const rosterStartDate = new Date();
    rosterStartDate.setDate(rosterStartDate.getDate() - 2);
    const rosterStartIso = formatLocalDateOnly(rosterStartDate);
    const todayIso = formatLocalDateOnly(new Date());
    // Reads dashboard.upcomingRosters rather than useList({resource: 'rosters'})
    // on purpose: the grid needs every upcoming shift, unpaginated, while the
    // 'rosters' resource (api.listRosters) is a paginated, full-history list
    // built for a future admin roster listing — a different shape, not just
    // a different fetch mechanism. Only the mutations below go through it.
    const rosterTable = buildRosterTableModel(
        dashboard.upcomingRosters,
        dashboard.shiftTypes,
        rosterStartIso,
    );
    const Form = ({ row }: { row?: RosterDTO }) => {
        const [userId, setUserId] = useState(row?.UserId || '');
        const initialShiftType = dashboard.shiftTypes.find(
            (shiftType) => shiftType.Name === row?.Name,
        );
        const [shiftTypeName, setShiftTypeName] = useState(initialShiftType?.Name || '');
        const [startTime, setStartTime] = useState(
            row?.StartTime || initialShiftType?.DefaultStartTime || '',
        );
        const [endTime, setEndTime] = useState(
            row?.EndTime || initialShiftType?.DefaultEndTime || '',
        );
        const selectShiftType = (nextShiftTypeName: string) => {
            setShiftTypeName(nextShiftTypeName);
            const times = getShiftTypeTimes(dashboard.shiftTypes, nextShiftTypeName);
            if (!times) return;
            setStartTime(times.startTime);
            setEndTime(times.endTime);
        };
        const { mutateAsync: createRoster } = useCreate();
        const { mutateAsync: updateRoster } = useUpdate();
        const save = useSave(
            async () => {
                const d = new FormData(
                    document.getElementById('refine-roster-form') as HTMLFormElement,
                );
                const v = {
                    name: String(d.get('name')),
                    startDate: String(d.get('startDate')),
                    endDate: String(d.get('endDate')),
                    startTime: String(d.get('startTime') || ''),
                    endTime: String(d.get('endTime') || ''),
                    userId: String(d.get('userId') || ''),
                };
                const mutateOptions = {
                    successNotification: false,
                    errorNotification: false,
                } as const;
                if (row) {
                    await updateRoster({
                        resource: 'rosters',
                        id: row.Id,
                        values: v,
                        ...mutateOptions,
                    });
                } else {
                    await createRoster({ resource: 'rosters', values: v, ...mutateOptions });
                }
            },
            () => {
                setCreating(false);
                setEditing(undefined);
            },
        );
        return (
            <Modal
                title={row ? 'Edit shift' : 'Schedule a shift'}
                close={() => {
                    setCreating(false);
                    setEditing(undefined);
                }}>
                <form id="refine-roster-form" className="grid gap-3" noValidate onSubmit={save.run}>
                    <AntForm.Item label="Shift" required>
                        <input type="hidden" name="name" value={shiftTypeName} required />
                        <Select
                            value={shiftTypeName}
                            onChange={selectShiftType}
                            className="antd-full-width">
                            <Select.Option value="" disabled>
                                Select a shift
                            </Select.Option>
                            {dashboard.shiftTypes.map((shiftType) => (
                                <Select.Option key={shiftType.Name} value={shiftType.Name}>
                                    {shiftType.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <AntForm.Item label="Assignee" required>
                        <input type="hidden" name="userId" value={userId} required />
                        <Select value={userId} onChange={setUserId} className="antd-full-width">
                            <Select.Option value="" disabled>
                                Select an assignee
                            </Select.Option>
                            {users.map((user) => (
                                <Select.Option key={user.Email} value={user.Email}>
                                    {user.Name}
                                </Select.Option>
                            ))}
                        </Select>
                    </AntForm.Item>
                    <TextField
                        name="startDate"
                        label="Start date"
                        type="date"
                        value={row?.StartDate}
                        required
                    />
                    <TextField
                        name="endDate"
                        label="End date"
                        type="date"
                        value={row?.EndDate}
                        required
                    />
                    <AntForm.Item label="Start time" className="antd-form-item">
                        <Input
                            name="startTime"
                            type="time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                        />
                    </AntForm.Item>
                    <AntForm.Item label="End time" className="antd-form-item">
                        <Input
                            name="endTime"
                            type="time"
                            value={endTime}
                            onChange={(event) => setEndTime(event.target.value)}
                        />
                    </AntForm.Item>
                    <div className="flex items-center justify-between gap-3">
                        <SaveFooter
                            label={row ? 'Save' : 'Add'}
                            busy={save.busy}
                            errorMessage={save.errorMessage}
                        />
                        {row && (
                            <Button
                                type="primary"
                                danger
                                htmlType="button"
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                    setEditing(undefined);
                                    setDeleting(row);
                                }}
                                aria-label="Delete shift"
                                title="Delete shift"
                            />
                        )}
                    </div>
                </form>
            </Modal>
        );
    };
    return (
        <Page
            title="Roster"
            className="roster-page"
            action={
                canEdit && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreating(true)}
                        aria-label="Add shift"
                        title="Add shift"
                    />
                )
            }>
            <>
                {rosterTable.rows.length ? (
                    <div className="roster-table-scroll">
                        <table className="roster-table">
                            <thead>
                                <tr>
                                    <th scope="col" className="roster-date-header">
                                        Date
                                    </th>
                                    {rosterTable.volunteers.map((volunteer) => (
                                        <th
                                            key={volunteer.userId}
                                            scope="colgroup"
                                            colSpan={volunteer.lanes.length}
                                            className="roster-volunteer-header">
                                            {volunteer.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rosterTable.rows.map((row, rowIndex) => (
                                    <tr
                                        key={row.isoDate}
                                        className={
                                            row.isoDate === todayIso ? 'roster-today-row' : ''
                                        }>
                                        <th scope="row" className="roster-date-cell">
                                            {row.label}
                                        </th>
                                        {rosterTable.volunteers.flatMap((volunteer) =>
                                            volunteer.lanes.map((lane, laneIndex) => {
                                                const shift = lane.shifts.find(
                                                    (candidate) =>
                                                        candidate.startIndex === rowIndex,
                                                );
                                                const coveredByEarlierShift = lane.shifts.some(
                                                    (candidate) =>
                                                        candidate.startIndex < rowIndex &&
                                                        candidate.endIndex >= rowIndex,
                                                );
                                                if (coveredByEarlierShift) return [];
                                                if (!shift) {
                                                    return (
                                                        <td
                                                            key={`${volunteer.userId}-${laneIndex}-${row.isoDate}`}
                                                            className="roster-empty-cell"
                                                        />
                                                    );
                                                }
                                                const timing = formatRosterTableTimes(shift.roster);
                                                const dateRange =
                                                    shift.roster.StartDate === shift.roster.EndDate
                                                        ? row.label
                                                        : `${shift.roster.StartDate} – ${shift.roster.EndDate}`;
                                                return (
                                                    <td
                                                        key={`${volunteer.userId}-${laneIndex}-${row.isoDate}`}
                                                        rowSpan={
                                                            shift.endIndex - shift.startIndex + 1
                                                        }
                                                        className="roster-shift-cell">
                                                        <button
                                                            type="button"
                                                            className="roster-shift-block"
                                                            style={{
                                                                backgroundColor: shift.color
                                                                    ? `${shift.color}26`
                                                                    : undefined,
                                                            }}
                                                            onClick={() => setEditing(shift.roster)}
                                                            aria-label={`Edit ${shift.roster.Name} for ${volunteer.name}, ${dateRange}${timing ? `, ${timing}` : ''}`}>
                                                            <span className="roster-shift-name">
                                                                {shift.roster.Name}
                                                            </span>
                                                            {timing && (
                                                                <span className="roster-shift-time">
                                                                    {timing}
                                                                </span>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            }),
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty>No shifts scheduled.</Empty>
                )}
            </>
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this shift?"
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await deleteRoster({
                            resource: 'rosters',
                            id: deleting.Id,
                            successNotification: false,
                            errorNotification: false,
                        });
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {(creating || editing) && <Form row={editing} />}
        </Page>
    );
}
