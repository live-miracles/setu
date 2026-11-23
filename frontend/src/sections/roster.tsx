import { useState } from 'react';
import { useCreate, useDelete, useUpdate } from '../ui/resources';
import { DashboardGate } from '../ui/dashboard';
import { useMe, useShiftTypes, useUsers } from '../ui/reference';
import { Input, Select, Field } from '../ui/form-kit';
import { Button, Empty } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { Icon } from '../ui/icons';
import { formatLocalDateOnly } from '../ui/date';
import { toneProps } from '../ui/tone';
import {
    buildRosterTableModel,
    formatRosterTableTimes,
    getShiftTypeTimes,
} from '../ui/roster-table';
import { canApprove } from '../workflows';
import { ActionConfirmation } from './action-confirmation';
import { SaveFooter, TextField } from './form-fields';
import { Page } from './page';
import { useSave } from './save-hooks';

// Module level on purpose: a component defined inside Roster gets a new type
// on every render, which remounts the modal and loses what was typed.
function RosterForm({
    row,
    shiftTypes,
    users,
    todayIso,
    onClose,
    onDelete,
}: {
    row?: RosterDTO;
    shiftTypes: ShiftType[];
    users: UserDTO[];
    todayIso: string;
    onClose: () => void;
    onDelete: (row: RosterDTO) => void;
}) {
    const [userId, setUserId] = useState(row?.UserId || '');
    const initialShiftType = shiftTypes.find((shiftType) => shiftType.Id === row?.ShiftTypeId);
    const [shiftTypeId, setShiftTypeId] = useState(row?.ShiftTypeId || '');
    const [shiftName, setShiftName] = useState(row?.ShiftName || '');
    const [startTime, setStartTime] = useState(
        row?.StartTime || initialShiftType?.DefaultStartTime || '',
    );
    const [endTime, setEndTime] = useState(row?.EndTime || initialShiftType?.DefaultEndTime || '');
    const selectShiftType = (nextShiftTypeId: string) => {
        setShiftTypeId(nextShiftTypeId);
        const times = getShiftTypeTimes(shiftTypes, nextShiftTypeId);
        if (!times) return;
        setStartTime(times.startTime);
        setEndTime(times.endTime);
    };
    const { mutateAsync: createRoster } = useCreate();
    const { mutateAsync: updateRoster } = useUpdate();
    const save = useSave(async () => {
        if (!shiftTypeId) throw new Error('Shift is required.');
        if (!userId) throw new Error('Assignee is required.');
        const d = new FormData(document.getElementById('roster-form') as HTMLFormElement);
        const v = {
            shiftTypeId,
            shiftName: String(d.get('shiftName') || '').trim(),
            startDate: String(d.get('startDate')),
            endDate: String(d.get('endDate')),
            startTime: String(d.get('startTime') || ''),
            endTime: String(d.get('endTime') || ''),
            userId: String(d.get('userId') || ''),
        };
        // A blank time means the start / end of its day (the server
        // stores it that way and reads it back as blank).
        const startAt = `${v.startDate}T${v.startTime || '00:00'}`;
        const endAt = `${v.endDate}T${v.endTime || '23:59'}`;
        if (endAt <= startAt) throw new Error('End time is before start time.');
        if (row) {
            await updateRoster({
                resource: 'rosters',
                id: row.Id,
                values: v,
            });
        } else {
            await createRoster({ resource: 'rosters', values: v });
        }
    }, onClose);
    return (
        <Modal title={row ? 'Edit shift' : 'Schedule a shift'} close={onClose}>
            <form id="roster-form" className="grid gap-3" noValidate onSubmit={save.run}>
                <Field label="Shift" required>
                    <input type="hidden" name="shiftTypeId" value={shiftTypeId} required />
                    <Select value={shiftTypeId} onChange={selectShiftType} className="w-full">
                        <Select.Option value="" disabled>
                            Select a shift
                        </Select.Option>
                        {shiftTypes.map((shiftType) => (
                            <Select.Option key={shiftType.Id} value={shiftType.Id}>
                                {shiftType.Name}
                            </Select.Option>
                        ))}
                    </Select>
                </Field>
                <Field label="Shift name (optional)">
                    <Input
                        name="shiftName"
                        value={shiftName}
                        onChange={(event) => setShiftName(event.target.value)}
                        placeholder={initialShiftType?.Name || 'Uses shift preset name'}
                    />
                </Field>
                <Field label="Assignee" required>
                    <input type="hidden" name="userId" value={userId} required />
                    <Select value={userId} onChange={setUserId} className="w-full">
                        <Select.Option value="" disabled>
                            Select an assignee
                        </Select.Option>
                        {users.map((user) => (
                            <Select.Option key={user.Email} value={user.Email}>
                                {user.Name}
                            </Select.Option>
                        ))}
                    </Select>
                </Field>
                <TextField
                    name="startDate"
                    label="Start date"
                    type="date"
                    value={row?.StartDate || todayIso}
                    required
                />
                <TextField
                    name="endDate"
                    label="End date"
                    type="date"
                    value={row?.EndDate || todayIso}
                    required
                />
                <Field label="Start time">
                    <Input
                        name="startTime"
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                    />
                </Field>
                <Field label="End time">
                    <Input
                        name="endTime"
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                    />
                </Field>
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
                            icon={<Icon name="trash" />}
                            onClick={() => onDelete(row)}
                            aria-label="Delete shift"
                            title="Delete shift"
                        />
                    )}
                </div>
            </form>
        </Modal>
    );
}

export function Roster() {
    return (
        <DashboardGate>
            {(dashboard) => <RosterGrid rosters={dashboard.upcomingRosters} />}
        </DashboardGate>
    );
}

function RosterGrid({ rosters }: { rosters: RosterDTO[] }) {
    const canEdit = canApprove(useMe());
    const shiftTypes = useShiftTypes();
    const [editing, setEditing] = useState<RosterDTO>();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<RosterDTO | null>(null);
    const { mutateAsync: deleteRoster } = useDelete();
    const users = useUsers().filter(canApprove);
    const rosterStartDate = new Date();
    rosterStartDate.setDate(rosterStartDate.getDate() - 2);
    const rosterStartIso = formatLocalDateOnly(rosterStartDate);
    const todayIso = formatLocalDateOnly(new Date());
    // The grid reads the dashboard's upcoming shifts rather than
    // useList({resource: 'rosters'}) on purpose: it needs every upcoming shift,
    // unpaginated, while the 'rosters' resource (api.listRosters) is a
    // paginated, full-history list. Saving a shift refetches the dashboard
    // (see DEPENDENT_QUERIES in ui/resources.ts).
    const rosterTable = buildRosterTableModel(rosters, shiftTypes, rosterStartIso);
    const rosterLaneColumns = rosterTable.volunteers.flatMap((volunteer) =>
        volunteer.lanes.map((_, laneIndex) => `${volunteer.userId}-${laneIndex}`),
    );
    return (
        <Page
            title="Roster"
            className="roster-page"
            action={
                canEdit && (
                    <Button
                        type="primary"
                        icon={<Icon name="plus" />}
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
                            <colgroup>
                                <col className="roster-date-column" />
                                {rosterLaneColumns.map((key) => (
                                    <col key={key} className="roster-lane-column" />
                                ))}
                                <col className="roster-spacer-column" />
                            </colgroup>
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
                                    <th
                                        scope="col"
                                        className="roster-spacer-header"
                                        aria-hidden="true"
                                    />
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
                                                const tone = toneProps(
                                                    shift.color,
                                                    'roster-shift-block',
                                                    ['accent'],
                                                );
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
                                                            className={tone.className}
                                                            style={tone.style}
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
                                        <td className="roster-spacer-cell" aria-hidden="true" />
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
                        });
                        setDeleting(null);
                    }}
                />
            )}
            {(creating || editing) && (
                <RosterForm
                    key={editing?.Id ?? 'new'}
                    row={editing}
                    shiftTypes={shiftTypes}
                    users={users}
                    todayIso={todayIso}
                    onClose={() => {
                        setCreating(false);
                        setEditing(undefined);
                    }}
                    onDelete={(row) => {
                        setEditing(undefined);
                        setDeleting(row);
                    }}
                />
            )}
        </Page>
    );
}
