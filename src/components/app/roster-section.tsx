'use client';

import {
    CalendarOutlined,
    ClockCircleOutlined,
    EnvironmentOutlined,
    PlusOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { App, Avatar, Button, Card, Empty, Form, Input, Modal, Segmented, Select } from 'antd';
import { format, isAfter, isBefore, startOfDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { useDemoStore } from '@/demo/store';
import { initials } from './shared';
import type { ShiftPeriod } from '@/domain/types';

interface ShiftForm {
    date: string;
    period: ShiftPeriod;
    startTime: string;
    endTime: string;
    location: string;
    assigneeIds: string[];
    notes?: string;
}

export function RosterSection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [view, setView] = useState<string>('Upcoming');
    const [open, setOpen] = useState(false);
    const [form] = Form.useForm<ShiftForm>();
    const today = startOfDay(new Date());

    const shifts = useMemo(
        () =>
            [...state.shifts]
                .filter((shift) =>
                    view === 'Upcoming'
                        ? isAfter(new Date(shift.endsAt), today)
                        : isBefore(new Date(shift.endsAt), today),
                )
                .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
        [state.shifts, today, view],
    );

    const createShift = async (values: ShiftForm) => {
        const assignees = state.profiles
            .filter((profile) => values.assigneeIds.includes(profile.id))
            .map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl }));
        try {
            await actions.addShift({
                startsAt: new Date(`${values.date}T${values.startTime}:00`).toISOString(),
                endsAt: new Date(`${values.date}T${values.endTime}:00`).toISOString(),
                period: values.period,
                location: values.location,
                assignees,
                notes: values.notes,
            });
            setOpen(false);
            form.resetFields();
            message.success('Shift created. Notifications are queued for the team.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Create failed.');
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">People & coverage</p>
                    <h2>Keep every shift covered.</h2>
                    <p>
                        Plan morning, evening and night coverage. Everyone sees the same live roster
                        and gets notified when assigned.
                    </p>
                </div>
                <div className="page-actions">
                    <Segmented
                        value={view}
                        options={['Upcoming', 'Past']}
                        onChange={(value) => setView(String(value))}
                    />
                    {state.currentUser.role === 'admin' && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setOpen(true)}>
                            Add shift
                        </Button>
                    )}
                </div>
            </div>

            <div className="list-stack">
                {shifts.length === 0 && (
                    <Card className="surface-card">
                        <Empty description={`No ${view.toLowerCase()} shifts`} />
                    </Card>
                )}
                {shifts.map((shift) => (
                    <Card key={shift.id} className="surface-card">
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(150px, .55fr) minmax(0, 1fr) auto',
                                gap: 24,
                                alignItems: 'center',
                            }}>
                            <div>
                                <p className="eyebrow" style={{ marginBottom: 6 }}>
                                    {format(new Date(shift.startsAt), 'EEEE')}
                                </p>
                                <h3 style={{ margin: 0, fontSize: 22 }}>
                                    {format(new Date(shift.startsAt), 'd MMM yyyy')}
                                </h3>
                            </div>
                            <div>
                                <p className="row-title">
                                    <ClockCircleOutlined style={{ marginRight: 7 }} />
                                    {shift.period} · {format(new Date(shift.startsAt), 'h:mm a')}–{' '}
                                    {format(new Date(shift.endsAt), 'h:mm a')}
                                </p>
                                <p className="row-meta">
                                    <EnvironmentOutlined style={{ marginRight: 7 }} />
                                    {shift.location}
                                    {shift.notes ? ` · ${shift.notes}` : ''}
                                </p>
                                <div className="avatar-stack">
                                    {shift.assignees.map((person, index) => (
                                        <Avatar
                                            key={person.id}
                                            style={{
                                                background: index % 2 ? '#58c9bd' : '#ff6257',
                                            }}>
                                            {initials(person.name)}
                                        </Avatar>
                                    ))}
                                </div>
                            </div>
                            <div style={{ color: '#8b8e94', fontSize: 12 }}>
                                <TeamOutlined style={{ marginRight: 6 }} />
                                {shift.assignees.length} assigned
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <Modal
                title="Create roster shift"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => form.submit()}
                okText="Create & notify"
                destroyOnHidden>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={createShift}
                    initialValues={{
                        period: 'Morning',
                        startTime: '06:00',
                        endTime: '12:00',
                        location: 'Drishti Studio',
                    }}>
                    <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                        <Input type="date" prefix={<CalendarOutlined />} />
                    </Form.Item>
                    <Form.Item name="period" label="Shift" rules={[{ required: true }]}>
                        <Select
                            options={['Morning', 'Evening', 'Night'].map((value) => ({
                                value,
                                label: value,
                            }))}
                        />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="startTime" label="Starts" rules={[{ required: true }]}>
                            <Input type="time" />
                        </Form.Item>
                        <Form.Item name="endTime" label="Ends" rules={[{ required: true }]}>
                            <Input type="time" />
                        </Form.Item>
                    </div>
                    <Form.Item name="location" label="Location" rules={[{ required: true }]}>
                        <Input prefix={<EnvironmentOutlined />} />
                    </Form.Item>
                    <Form.Item name="assigneeIds" label="Volunteers" rules={[{ required: true }]}>
                        <Select
                            mode="multiple"
                            placeholder="Select team members"
                            options={state.profiles
                                .filter((profile) => profile.status === 'active')
                                .map((profile) => ({
                                    value: profile.id,
                                    label: profile.name,
                                }))}
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="Notes">
                        <Input.TextArea rows={3} placeholder="Optional handover notes" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
