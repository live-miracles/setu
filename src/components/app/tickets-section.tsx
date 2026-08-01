'use client';

import { CheckOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Tag } from 'antd';
import { useMemo, useState } from 'react';
import type { Ticket, TicketStatus } from '@/domain/types';
import { useDemoStore } from '@/demo/store';

interface TicketForm {
    title: string;
    description: string;
}

const columns: { status: TicketStatus; title: string }[] = [
    { status: 'unassigned', title: 'Not assigned' },
    { status: 'pending', title: 'Pending' },
    { status: 'closed', title: 'Closed' },
];

export function TicketsSection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [query, setQuery] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [selected, setSelected] = useState<Ticket | null>(null);
    const [assigneeId, setAssigneeId] = useState<string>();
    const [form] = Form.useForm<TicketForm>();

    const filtered = useMemo(
        () =>
            state.tickets.filter((ticket) =>
                [String(ticket.displayId), ticket.title]
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.tickets],
    );

    const createTicket = async (values: TicketForm) => {
        try {
            await actions.addTicket(values);
            form.resetFields();
            setCreateOpen(false);
            message.success('Ticket created. The operations team has been notified.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Create failed.');
        }
    };

    const assign = async () => {
        if (!selected || !assigneeId) {
            message.error('Select a team member.');
            return;
        }
        try {
            await actions.transitionTicket(selected.id, 'pending', assigneeId);
            setSelected(null);
            setAssigneeId(undefined);
            message.success('Ticket assigned and notification queued.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Assign failed.');
        }
    };

    const transition = async (ticket: Ticket, status: TicketStatus) => {
        try {
            await actions.transitionTicket(ticket.id, status);
            message.success(`TKT-${ticket.displayId} moved to ${status}.`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Action failed.');
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Operational support</p>
                    <h2>Resolve issues without losing context.</h2>
                    <p>Capture the owner and status of every studio issue.</p>
                </div>
                <div className="page-actions">
                    <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search tickets"
                        onChange={(event) => setQuery(event.target.value)}
                        style={{ width: 220 }}
                    />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}>
                        New ticket
                    </Button>
                </div>
            </div>

            <div className="tickets-board">
                {columns.map((column) => {
                    const tickets = filtered.filter((ticket) => ticket.status === column.status);
                    return (
                        <section className="ticket-column" key={column.status}>
                            <div className="ticket-column-title">
                                <h3>{column.title}</h3>
                                <Tag variant="filled">{tickets.length}</Tag>
                            </div>
                            {tickets.map((ticket) => (
                                <article className="ticket-card" key={ticket.id}>
                                    <span className="request-id">TKT-{ticket.displayId}</span>
                                    <h4>{ticket.title}</h4>
                                    <p>{ticket.description}</p>
                                    <div className="ticket-card-footer">
                                        <span>
                                            {ticket.assignee ? (
                                                <Tag color="processing" variant="filled">
                                                    {ticket.assignee.name}
                                                </Tag>
                                            ) : (
                                                <Tag variant="filled">Unassigned</Tag>
                                            )}
                                        </span>
                                        <span>
                                            {ticket.status === 'unassigned' &&
                                                state.currentUser.role === 'admin' && (
                                                    <Button
                                                        size="small"
                                                        type="primary"
                                                        icon={<UserAddOutlined />}
                                                        onClick={() => setSelected(ticket)}>
                                                        Assign
                                                    </Button>
                                                )}
                                            {ticket.status === 'pending' &&
                                                (state.currentUser.role === 'admin' ||
                                                    ticket.assignee?.id ===
                                                        state.currentUser.id) && (
                                                    <Button
                                                        size="small"
                                                        icon={<CheckOutlined />}
                                                        onClick={() =>
                                                            transition(ticket, 'closed')
                                                        }>
                                                        Close
                                                    </Button>
                                                )}
                                            {ticket.status === 'closed' &&
                                                state.currentUser.role === 'admin' && (
                                                    <Button
                                                        size="small"
                                                        icon={<ReloadOutlined />}
                                                        onClick={() =>
                                                            transition(ticket, 'pending')
                                                        }>
                                                        Reopen
                                                    </Button>
                                                )}
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </section>
                    );
                })}
            </div>

            <Modal
                title="Create support ticket"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => form.submit()}
                okText="Create ticket"
                destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={createTicket}>
                    <Form.Item name="title" label="Issue" rules={[{ required: true, min: 3 }]}>
                        <Input placeholder="Short, searchable title" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ required: true, min: 8 }]}>
                        <Input.TextArea
                            rows={4}
                            placeholder="What happened, when, and what have you already tried?"
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={selected ? `Assign TKT-${selected.displayId}` : 'Assign ticket'}
                open={Boolean(selected)}
                onCancel={() => setSelected(null)}
                onOk={assign}
                okText="Assign & notify">
                <p style={{ color: '#74777f' }}>The selected volunteer will receive an email notification.</p>
                <Select
                    value={assigneeId}
                    onChange={setAssigneeId}
                    placeholder="Select a volunteer"
                    style={{ width: '100%' }}
                    options={state.users.map((user) => ({
                        value: user.id,
                        label: `${user.name} · ${user.department}`,
                    }))}
                />
            </Modal>
        </>
    );
}
