'use client';

import {
    AppstoreOutlined,
    CalendarOutlined,
    CheckOutlined,
    CloseOutlined,
    InboxOutlined,
    PlusOutlined,
    RollbackOutlined,
    SearchOutlined,
    SendOutlined,
    ShoppingOutlined,
} from '@ant-design/icons';
import {
    App,
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Progress,
    Segmented,
    Select,
    Tag,
} from 'antd';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { InventoryRequest, InventoryRequestStatus, ReturnCondition } from '@/domain/types';
import { useDemoStore } from '@/demo/store';
import { StatusTag } from './shared';
import { AttachmentUploader } from './attachment-uploader';

interface RequestForm {
    title: string;
    fromDate: string;
    toDate: string;
    purpose: string;
    inventoryItemId: string;
    quantity: number;
}

interface ActionDialog {
    request: InventoryRequest;
    nextStatus: InventoryRequestStatus;
    title: string;
    noteRequired: boolean;
}

const actionLabel: Partial<
    Record<InventoryRequestStatus, { title: string; icon: React.ReactNode }>
> = {
    approved: { title: 'Approve', icon: <CheckOutlined /> },
    rejected: { title: 'Reject', icon: <CloseOutlined /> },
    issued: { title: 'Issue', icon: <SendOutlined /> },
    returned: { title: 'Return', icon: <RollbackOutlined /> },
    cancelled: { title: 'Cancel', icon: <CloseOutlined /> },
    closed: { title: 'Close', icon: <CheckOutlined /> },
};

export function InventorySection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [view, setView] = useState<string>('Requests');
    const [query, setQuery] = useState('');
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);
    const [actionNote, setActionNote] = useState('');
    const [returnCondition, setReturnCondition] = useState<ReturnCondition>('good');
    const [form] = Form.useForm<RequestForm>();

    const requests = useMemo(
        () =>
            state.requests.filter((request) =>
                [request.id, request.title, request.requester.name]
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.requests],
    );
    const inventory = useMemo(
        () =>
            state.inventory.filter((item) =>
                [item.name, item.type, item.location]
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.inventory],
    );

    const createRequest = async (values: RequestForm) => {
        const inventoryItem = state.inventory.find((item) => item.id === values.inventoryItemId);
        if (!inventoryItem) return;
        try {
            await actions.addRequest({
                title: values.title,
                requester: {
                    id: state.currentUser.id,
                    name: state.currentUser.name,
                    department: state.currentUser.department,
                },
                fromDate: values.fromDate,
                toDate: values.toDate,
                purpose: values.purpose,
                status: 'submitted',
                items: [
                    {
                        id: crypto.randomUUID(),
                        inventoryItemId: inventoryItem.id,
                        name: inventoryItem.name,
                        quantity: values.quantity,
                        returnedQuantity: 0,
                    },
                ],
            });
            form.resetFields();
            setRequestModalOpen(false);
            message.success('Request submitted for approval.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Create failed.');
        }
    };

    const openAction = (request: InventoryRequest, nextStatus: InventoryRequestStatus) => {
        const label = actionLabel[nextStatus];
        setActionNote('');
        setReturnCondition('good');
        setActionDialog({
            request,
            nextStatus,
            title: `${label?.title ?? 'Update'} ${request.id}`,
            noteRequired: ['rejected', 'cancelled', 'returned'].includes(nextStatus),
        });
    };

    const confirmAction = async () => {
        if (!actionDialog) return;
        if (actionDialog.noteRequired && actionNote.trim().length < 3) {
            message.error('Please add a short note for this action.');
            return;
        }
        const note =
            actionDialog.nextStatus === 'returned'
                ? `${returnCondition}: ${actionNote}`
                : actionNote;
        try {
            await actions.transitionRequest(actionDialog.request.id, actionDialog.nextStatus, note);
            message.success(`${actionDialog.request.id} moved to ${actionDialog.nextStatus}.`);
            setActionDialog(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Action failed.');
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Equipment lifecycle</p>
                    <h2>Know what is available and where.</h2>
                    <p>
                        Submit requests, approve handovers and record every return without chasing
                        spreadsheets.
                    </p>
                </div>
                <div className="page-actions">
                    <Segmented
                        value={view}
                        onChange={(value) => setView(String(value))}
                        options={[
                            { label: 'Requests', value: 'Requests', icon: <InboxOutlined /> },
                            {
                                label: 'Equipment',
                                value: 'Equipment',
                                icon: <AppstoreOutlined />,
                            },
                        ]}
                    />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setRequestModalOpen(true)}>
                        New request
                    </Button>
                </div>
            </div>

            <Card className="surface-card">
                <div className="toolbar">
                    <Input.Search
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder={`Search ${view.toLowerCase()}`}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <span style={{ color: '#888b92', fontSize: 11 }}>
                        {view === 'Requests' ? requests.length : inventory.length} records · live
                    </span>
                </div>

                {view === 'Requests' ? (
                    <div className="list-stack">
                        {requests.map((request) => (
                            <div className="request-row" key={request.id}>
                                <div>
                                    <span className="request-id">{request.id}</span>
                                    <h4>{request.title}</h4>
                                    <div className="request-items">
                                        {request.requester.name} ·{' '}
                                        {format(new Date(request.fromDate), 'd MMM')}–{' '}
                                        {format(new Date(request.toDate), 'd MMM yyyy')}
                                    </div>
                                    <div className="request-items">
                                        {request.items
                                            .map((item) => `${item.quantity}× ${item.name}`)
                                            .join(' · ')}
                                    </div>
                                </div>
                                <div
                                    className="request-actions"
                                    style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {request.isOverdue && (
                                        <Tag color="error" variant="filled">
                                            Overdue
                                        </Tag>
                                    )}
                                    <StatusTag status={request.status} />
                                    {state.currentUser.role === 'admin' &&
                                        requestActions(request).map((nextStatus) => (
                                            <Button
                                                key={nextStatus}
                                                size="small"
                                                type={
                                                    nextStatus === 'approved' ||
                                                    nextStatus === 'issued' ||
                                                    nextStatus === 'returned'
                                                        ? 'primary'
                                                        : 'default'
                                                }
                                                danger={['rejected', 'cancelled'].includes(
                                                    nextStatus,
                                                )}
                                                icon={actionLabel[nextStatus]?.icon}
                                                onClick={() => openAction(request, nextStatus)}>
                                                {actionLabel[nextStatus]?.title}
                                            </Button>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="list-stack">
                        {inventory.map((item) => {
                            const percentage = Math.round((item.available / item.total) * 100);
                            return (
                                <div className="inventory-row" key={item.id}>
                                    <div className="inventory-icon">
                                        <ShoppingOutlined />
                                    </div>
                                    <div>
                                        <p className="row-title">{item.name}</p>
                                        <p className="row-meta">
                                            {item.type} · {item.location}
                                        </p>
                                    </div>
                                    <div className="stock-bar">
                                        <div className="stock-bar-label">
                                            <span>Available</span>
                                            <strong>
                                                {item.available}/{item.total}
                                            </strong>
                                        </div>
                                        <Progress
                                            percent={percentage}
                                            showInfo={false}
                                            size="small"
                                            strokeColor={percentage <= 30 ? '#e04f5f' : '#58c9bd'}
                                        />
                                    </div>
                                    <Tag variant="filled">{item.serialNumber ?? 'Untracked'}</Tag>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <Modal
                title="Request equipment"
                open={requestModalOpen}
                onCancel={() => setRequestModalOpen(false)}
                onOk={() => form.submit()}
                okText="Submit request"
                destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={createRequest}>
                    <Form.Item
                        name="title"
                        label="Request name"
                        rules={[{ required: true, min: 3 }]}>
                        <Input placeholder="e.g. APAC 7 Step setup" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="fromDate" label="From" rules={[{ required: true }]}>
                            <Input type="date" prefix={<CalendarOutlined />} />
                        </Form.Item>
                        <Form.Item
                            name="toDate"
                            label="To"
                            dependencies={['fromDate']}
                            rules={[
                                { required: true },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        return !value || value >= getFieldValue('fromDate')
                                            ? Promise.resolve()
                                            : Promise.reject(
                                                  new Error('End date must be after start date.'),
                                              );
                                    },
                                }),
                            ]}>
                            <Input type="date" prefix={<CalendarOutlined />} />
                        </Form.Item>
                    </div>
                    <Form.Item
                        name="inventoryItemId"
                        label="Equipment"
                        rules={[{ required: true }]}>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            options={state.inventory.map((item) => ({
                                value: item.id,
                                label: `${item.name} · ${item.available} available`,
                                disabled: item.available === 0,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        initialValue={1}
                        rules={[{ required: true }]}>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="purpose" label="Purpose" rules={[{ required: true, min: 5 }]}>
                        <Input.TextArea
                            rows={3}
                            placeholder="Where and how will the equipment be used?"
                        />
                    </Form.Item>
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
                {actionDialog?.nextStatus === 'returned' && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 7, fontWeight: 650 }}>
                            Return condition
                        </label>
                        <Select
                            value={returnCondition}
                            onChange={setReturnCondition}
                            style={{ width: '100%' }}
                            options={[
                                { value: 'good', label: 'Returned in good condition' },
                                { value: 'damaged', label: 'Returned damaged' },
                                { value: 'missing', label: 'Missing' },
                            ]}
                        />
                    </div>
                )}
                <label style={{ display: 'block', marginBottom: 7, fontWeight: 650 }}>
                    Note {actionDialog?.noteRequired ? '(required)' : '(optional)'}
                </label>
                <Input.TextArea
                    rows={4}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    placeholder="Add a clear handover or decision note"
                />
                {actionDialog?.nextStatus === 'returned' && (
                    <div style={{ marginTop: 16 }}>
                        <AttachmentUploader
                            ownerType="inventory_request"
                            ownerId={actionDialog.request.recordId}
                        />
                    </div>
                )}
            </Modal>
        </>
    );
}

function requestActions(request: InventoryRequest): InventoryRequestStatus[] {
    switch (request.status) {
        case 'submitted':
            return ['approved', 'rejected', 'cancelled'];
        case 'approved':
            return ['issued', 'cancelled'];
        case 'issued':
            return ['returned'];
        case 'returned':
        case 'rejected':
        case 'cancelled':
            return ['closed'];
        default:
            return [];
    }
}
