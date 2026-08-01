'use client';

import {
    CalendarOutlined,
    CheckOutlined,
    CloseOutlined,
    CommentOutlined,
    MinusCircleOutlined,
    PlaySquareOutlined,
    PlusOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Form, Input, Modal, Select } from 'antd';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { ProgramRequest, ProgramRequestStatus } from '@/domain/types';
import { useDemoStore } from '@/demo/store';
import { CommentsPanel, StatusTag } from './shared';

interface MasterOption {
    id: string;
    name: string;
}

interface SessionFormValue {
    name: string;
    type: string;
    startDateTime: string;
    endDateTime: string;
}

interface ProgramForm {
    name: string;
    type: string;
    placeId: string;
    sessions: SessionFormValue[];
}

interface ActionDialog {
    request: ProgramRequest;
    nextStatus: ProgramRequestStatus;
    title: string;
    noteRequired: boolean;
}

const actionLabel: Partial<Record<ProgramRequestStatus, { title: string; icon: React.ReactNode }>> = {
    approved: { title: 'Approve', icon: <CheckOutlined /> },
    rejected: { title: 'Reject', icon: <CloseOutlined /> },
    cancelled: { title: 'Cancel', icon: <CloseOutlined /> },
    closed: { title: 'Close', icon: <CheckOutlined /> },
};

export function ProgramSection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [query, setQuery] = useState('');
    const [places, setPlaces] = useState<MasterOption[]>([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
    const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);
    const [actionNote, setActionNote] = useState('');
    const [form] = Form.useForm<ProgramForm>();
    const detailRequest = state.programRequests.find((item) => item.id === detailRequestId) ?? null;

    useEffect(() => {
        fetch('/api/v1/places')
            .then((response) => response.json())
            .then((body: { data: MasterOption[] }) => setPlaces(body.data ?? []))
            .catch(() => message.error('Places could not be loaded.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const requests = useMemo(
        () =>
            state.programRequests.filter((request) =>
                [
                    String(request.displayId),
                    request.name,
                    request.type,
                    request.place,
                    request.requester.name,
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.programRequests],
    );

    const createRequest = async (values: ProgramForm) => {
        const place = places.find((item) => item.id === values.placeId);
        if (!place) return;
        try {
            await actions.addProgramRequest({
                name: values.name,
                type: values.type,
                placeId: place.id,
                place: place.name,
                requester: {
                    id: state.currentUser.id,
                    name: state.currentUser.name,
                    department: state.currentUser.department,
                },
                sessions: values.sessions.map((session) => ({
                    id: crypto.randomUUID(),
                    name: session.name,
                    type: session.type,
                    startDateTime: new Date(session.startDateTime).toISOString(),
                    endDateTime: new Date(session.endDateTime).toISOString(),
                })),
            });
            form.resetFields();
            setCreateOpen(false);
            message.success('Program request submitted for approval.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Create failed.');
        }
    };

    const openAction = (request: ProgramRequest, nextStatus: ProgramRequestStatus) => {
        const label = actionLabel[nextStatus];
        setActionNote('');
        setActionDialog({
            request,
            nextStatus,
            title: `${label?.title ?? 'Update'} PRG-${request.displayId}`,
            noteRequired: ['rejected', 'cancelled'].includes(nextStatus),
        });
    };

    const confirmAction = async () => {
        if (!actionDialog) return;
        if (actionDialog.noteRequired && actionNote.trim().length < 3) {
            message.error('Please add a short note for this action.');
            return;
        }
        try {
            await actions.transitionProgramRequest(
                actionDialog.request.id,
                actionDialog.nextStatus,
                actionNote,
            );
            message.success(
                `PRG-${actionDialog.request.displayId} moved to ${actionDialog.nextStatus}.`,
            );
            setActionDialog(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Action failed.');
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Program planning</p>
                    <h2>Request and schedule programs.</h2>
                    <p>Submit a program with its place and sessions, then track it through approval.</p>
                </div>
                <div className="page-actions">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                        New program request
                    </Button>
                </div>
            </div>

            <Card className="surface-card">
                <div className="toolbar">
                    <Input.Search
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search program requests"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <span style={{ color: '#888b92', fontSize: 11 }}>
                        {requests.length} records · live
                    </span>
                </div>

                <div className="list-stack">
                    {requests.map((request) => (
                        <div className="request-row" key={request.id}>
                            <div>
                                <span className="request-id">PRG-{request.displayId}</span>
                                <h4>{request.name}</h4>
                                <div className="request-items">
                                    {request.type} · {request.place} · {request.requester.name}
                                </div>
                                <div className="request-items">
                                    {request.sessions
                                        .map(
                                            (session) =>
                                                `${session.name} (${format(new Date(session.startDateTime), 'd MMM, h:mm a')})`,
                                        )
                                        .join(' · ')}
                                </div>
                            </div>
                            <div
                                className="request-actions"
                                style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <StatusTag status={request.status} />
                                <Button
                                    size="small"
                                    icon={<CommentOutlined />}
                                    onClick={() => setDetailRequestId(request.id)}>
                                    {request.comments.length || 'Comments'}
                                </Button>
                                {state.currentUser.role === 'admin' &&
                                    requestActions(request).map((nextStatus) => (
                                        <Button
                                            key={nextStatus}
                                            size="small"
                                            type={nextStatus === 'approved' ? 'primary' : 'default'}
                                            danger={['rejected', 'cancelled'].includes(nextStatus)}
                                            icon={actionLabel[nextStatus]?.icon}
                                            onClick={() => openAction(request, nextStatus)}>
                                            {actionLabel[nextStatus]?.title}
                                        </Button>
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <Modal
                title="Request a program"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => form.submit()}
                okText="Submit request"
                destroyOnHidden
                width={640}>
                <Form form={form} layout="vertical" onFinish={createRequest} initialValues={{ sessions: [{}] }}>
                    <Form.Item name="name" label="Program name" rules={[{ required: true, min: 3 }]}>
                        <Input placeholder="e.g. Sunday Live Program" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="type" label="Program type" rules={[{ required: true }]}>
                            <Input placeholder="e.g. Live Broadcast" />
                        </Form.Item>
                        <Form.Item name="placeId" label="Place" rules={[{ required: true }]}>
                            <Select
                                placeholder="Select a place"
                                options={places.map((place) => ({ value: place.id, label: place.name }))}
                            />
                        </Form.Item>
                    </div>
                    <Form.List name="sessions">
                        {(fields, { add, remove }) => (
                            <div className="list-stack">
                                <label style={{ fontWeight: 650 }}>Sessions</label>
                                {fields.map((field) => (
                                    <Card key={field.key} size="small" className="surface-card">
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <Form.Item
                                                name={[field.name, 'name']}
                                                label="Session name"
                                                rules={[{ required: true }]}>
                                                <Input />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'type']}
                                                label="Session type"
                                                rules={[{ required: true }]}>
                                                <Input />
                                            </Form.Item>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <Form.Item
                                                name={[field.name, 'startDateTime']}
                                                label="Starts"
                                                rules={[{ required: true }]}>
                                                <Input type="datetime-local" prefix={<CalendarOutlined />} />
                                            </Form.Item>
                                            <Form.Item
                                                name={[field.name, 'endDateTime']}
                                                label="Ends"
                                                rules={[{ required: true }]}>
                                                <Input type="datetime-local" prefix={<CalendarOutlined />} />
                                            </Form.Item>
                                        </div>
                                        {fields.length > 1 && (
                                            <Button
                                                danger
                                                size="small"
                                                icon={<MinusCircleOutlined />}
                                                onClick={() => remove(field.name)}>
                                                Remove session
                                            </Button>
                                        )}
                                    </Card>
                                ))}
                                <Button icon={<PlaySquareOutlined />} onClick={() => add()}>
                                    Add session
                                </Button>
                            </div>
                        )}
                    </Form.List>
                </Form>
            </Modal>

            <Modal
                title={actionDialog?.title}
                open={Boolean(actionDialog)}
                onCancel={() => setActionDialog(null)}
                onOk={confirmAction}
                okText={actionDialog ? actionLabel[actionDialog.nextStatus]?.title : 'OK'}
                okButtonProps={{
                    danger: actionDialog
                        ? ['rejected', 'cancelled'].includes(actionDialog.nextStatus)
                        : false,
                }}>
                <label style={{ display: 'block', marginBottom: 7, fontWeight: 650 }}>
                    Note {actionDialog?.noteRequired ? '(required)' : '(optional)'}
                </label>
                <Input.TextArea
                    rows={4}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    placeholder="Add a clear decision note"
                />
            </Modal>

            <Modal
                title={
                    detailRequest ? `PRG-${detailRequest.displayId} · ${detailRequest.name}` : 'Program request'
                }
                open={Boolean(detailRequest)}
                onCancel={() => setDetailRequestId(null)}
                footer={null}>
                {detailRequest && (
                    <CommentsPanel
                        comments={detailRequest.comments}
                        onAdd={(message) => actions.addProgramComment(detailRequest.id, message)}
                    />
                )}
            </Modal>
        </>
    );
}

function requestActions(request: ProgramRequest): ProgramRequestStatus[] {
    switch (request.status) {
        case 'submitted':
            return ['approved', 'rejected', 'cancelled'];
        case 'approved':
            return ['cancelled', 'closed'];
        case 'rejected':
        case 'cancelled':
            return ['closed'];
        default:
            return [];
    }
}
