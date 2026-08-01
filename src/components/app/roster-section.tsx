'use client';

import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Form, Input, Modal, Segmented, Select } from 'antd';
import { format, isAfter, isBefore } from 'date-fns';
import { useMemo, useState } from 'react';
import { useDemoStore } from '@/demo/store';

interface RosterForm {
    name: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    userId: string;
}

const rosterStart = (roster: { startDate: string; startTime: string }) =>
    new Date(`${roster.startDate}T${roster.startTime}`);
const rosterEnd = (roster: { endDate: string; endTime: string }) =>
    new Date(`${roster.endDate}T${roster.endTime}`);

export function RosterSection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [view, setView] = useState<string>('Upcoming');
    const [open, setOpen] = useState(false);
    const [form] = Form.useForm<RosterForm>();
    const now = new Date();

    const rosters = useMemo(
        () =>
            [...state.rosters]
                .filter((roster) =>
                    view === 'Upcoming'
                        ? isAfter(rosterEnd(roster), now)
                        : isBefore(rosterEnd(roster), now),
                )
                .sort((a, b) => rosterStart(a).getTime() - rosterStart(b).getTime()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.rosters, view],
    );

    const createRoster = async (values: RosterForm) => {
        const user = state.users.find((candidate) => candidate.id === values.userId);
        if (!user) return;
        try {
            await actions.addRoster({
                name: values.name,
                startDate: values.startDate,
                endDate: values.endDate,
                startTime: values.startTime,
                endTime: values.endTime,
                user: { id: user.id, name: user.name },
            });
            setOpen(false);
            form.resetFields();
            message.success('Roster entry created. The volunteer has been notified.');
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
                        Plan coverage for every volunteer. Everyone sees the same live roster and
                        gets notified when assigned.
                    </p>
                </div>
                <div className="page-actions">
                    <Segmented
                        value={view}
                        options={['Upcoming', 'Past']}
                        onChange={(value) => setView(String(value))}
                    />
                    {state.currentUser.role === 'admin' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                            Add roster entry
                        </Button>
                    )}
                </div>
            </div>

            <div className="list-stack">
                {rosters.length === 0 && (
                    <Card className="surface-card">
                        <Empty description={`No ${view.toLowerCase()} roster entries`} />
                    </Card>
                )}
                {rosters.map((roster) => (
                    <Card key={roster.id} className="surface-card">
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(150px, .55fr) minmax(0, 1fr) auto',
                                gap: 24,
                                alignItems: 'center',
                            }}>
                            <div>
                                <p className="eyebrow" style={{ marginBottom: 6 }}>
                                    {format(rosterStart(roster), 'EEEE')}
                                </p>
                                <h3 style={{ margin: 0, fontSize: 22 }}>
                                    {format(rosterStart(roster), 'd MMM yyyy')}
                                </h3>
                            </div>
                            <div>
                                <p className="row-title">
                                    <ClockCircleOutlined style={{ marginRight: 7 }} />
                                    {roster.name} · {roster.startTime}–{roster.endTime}
                                </p>
                                <p className="row-meta">
                                    <UserOutlined style={{ marginRight: 7 }} />
                                    {roster.user.name}
                                </p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <Modal
                title="Add roster entry"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => form.submit()}
                okText="Create & notify"
                destroyOnHidden>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={createRoster}
                    initialValues={{ startTime: '06:00', endTime: '12:00' }}>
                    <Form.Item name="name" label="Shift name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Morning Shift" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
                            <Input type="date" prefix={<CalendarOutlined />} />
                        </Form.Item>
                        <Form.Item name="endDate" label="End date" rules={[{ required: true }]}>
                            <Input type="date" prefix={<CalendarOutlined />} />
                        </Form.Item>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="startTime" label="Starts" rules={[{ required: true }]}>
                            <Input type="time" />
                        </Form.Item>
                        <Form.Item name="endTime" label="Ends" rules={[{ required: true }]}>
                            <Input type="time" />
                        </Form.Item>
                    </div>
                    <Form.Item name="userId" label="Volunteer" rules={[{ required: true }]}>
                        <Select
                            placeholder="Select a team member"
                            options={state.users.map((user) => ({ value: user.id, label: user.name }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
