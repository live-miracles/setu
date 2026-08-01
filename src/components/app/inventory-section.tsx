'use client';

import {
    AppstoreOutlined,
    CalendarOutlined,
    CheckOutlined,
    CloseOutlined,
    CommentOutlined,
    InboxOutlined,
    PlusOutlined,
    RollbackOutlined,
    SearchOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Modal, Progress, Segmented, Select, Tag } from 'antd';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { InventoryRequest, InventoryRequestStatus, ReturnCondition } from '@/domain/types';
import { useDemoStore } from '@/demo/store';
import { CommentsPanel, StatusTag } from './shared';
import { DriveImageUploader } from './drive-image-uploader';

interface RequestForm {
    name: string;
    startDate: string;
    endDate: string;
    inventoryTypeId: string;
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

function PhotoSlots({
    images,
    onChange,
}: {
    images: string[];
    onChange: (images: string[]) => void;
}) {
    const slots: (string | undefined)[] = [images[0], images[1], images[2]];
    return (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {slots.map((value, index) => (
                <DriveImageUploader
                    key={index}
                    value={value}
                    onChange={(next) => {
                        const updated = [...slots];
                        updated[index] = next;
                        onChange(updated.filter((id): id is string => Boolean(id)));
                    }}
                />
            ))}
        </div>
    );
}

export function InventorySection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [view, setView] = useState<string>('Requests');
    const [query, setQuery] = useState('');
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [requestImages, setRequestImages] = useState<string[]>([]);
    const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);
    const [actionNote, setActionNote] = useState('');
    const [actionImages, setActionImages] = useState<string[]>([]);
    const [returnCondition, setReturnCondition] = useState<ReturnCondition>('good');
    const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
    const [form] = Form.useForm<RequestForm>();
    const detailRequest = state.inventoryRequests.find((item) => item.id === detailRequestId) ?? null;

    const requests = useMemo(
        () =>
            state.inventoryRequests.filter((request) =>
                [String(request.displayId), request.name, request.requester.name]
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.inventoryRequests],
    );
    const inventoryTypes = useMemo(
        () =>
            state.inventoryTypes.filter((type) =>
                [type.name, type.description ?? '']
                    .join(' ')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, state.inventoryTypes],
    );

    const createRequest = async (values: RequestForm) => {
        const inventoryType = state.inventoryTypes.find((type) => type.id === values.inventoryTypeId);
        if (!inventoryType) return;
        try {
            await actions.addInventoryRequest({
                name: values.name,
                requester: {
                    id: state.currentUser.id,
                    name: state.currentUser.name,
                    department: state.currentUser.department,
                },
                startDate: values.startDate,
                endDate: values.endDate,
                items: [
                    {
                        id: crypto.randomUUID(),
                        inventoryTypeId: inventoryType.id,
                        name: inventoryType.name,
                        quantity: values.quantity,
                        issuedQuantity: 0,
                        returnedQuantity: 0,
                    },
                ],
                images: requestImages,
            });
            form.resetFields();
            setRequestImages([]);
            setRequestModalOpen(false);
            message.success('Request submitted for approval.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Create failed.');
        }
    };

    const openAction = (request: InventoryRequest, nextStatus: InventoryRequestStatus) => {
        const label = actionLabel[nextStatus];
        setActionNote('');
        setActionImages(request.images);
        setReturnCondition('good');
        setActionDialog({
            request,
            nextStatus,
            title: `${label?.title ?? 'Update'} REQ-${request.displayId}`,
            noteRequired: ['rejected', 'cancelled', 'returned'].includes(nextStatus),
        });
    };

    const confirmAction = async () => {
        if (!actionDialog) return;
        if (actionDialog.noteRequired && actionNote.trim().length < 3) {
            message.error('Please add a short note for this action.');
            return;
        }
        const returns =
            actionDialog.nextStatus === 'returned'
                ? actionDialog.request.items
                      .filter((item) => item.returnedQuantity < item.issuedQuantity)
                      .map((item) => ({ itemId: item.id, condition: returnCondition }))
                : undefined;
        try {
            await actions.transitionInventoryRequest(actionDialog.request.id, actionDialog.nextStatus, {
                note: actionNote,
                returns,
                images: actionImages,
            });
            message.success(`REQ-${actionDialog.request.displayId} moved to ${actionDialog.nextStatus}.`);
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
                            { label: 'Catalog', value: 'Catalog', icon: <AppstoreOutlined /> },
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
                        {view === 'Requests' ? requests.length : inventoryTypes.length} records · live
                    </span>
                </div>

                {view === 'Requests' ? (
                    <div className="list-stack">
                        {requests.map((request) => (
                            <div className="request-row" key={request.id}>
                                <div>
                                    <span className="request-id">REQ-{request.displayId}</span>
                                    <h4>{request.name}</h4>
                                    <div className="request-items">
                                        {request.requester.name} ·{' '}
                                        {format(new Date(request.startDate), 'd MMM')}–{' '}
                                        {format(new Date(request.endDate), 'd MMM yyyy')}
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
                        {inventoryTypes.map((type) => {
                            const percentage = Math.round(
                                (type.availableQuantity / type.totalQuantity) * 100,
                            );
                            return (
                                <div className="inventory-row" key={type.id}>
                                    <div>
                                        <p className="row-title">{type.name}</p>
                                        <p className="row-meta">{type.description ?? 'No description'}</p>
                                    </div>
                                    <div className="stock-bar">
                                        <div className="stock-bar-label">
                                            <span>Available</span>
                                            <strong>
                                                {type.availableQuantity}/{type.totalQuantity}
                                            </strong>
                                        </div>
                                        <Progress
                                            percent={percentage}
                                            showInfo={false}
                                            size="small"
                                            strokeColor={percentage <= 30 ? '#e04f5f' : '#58c9bd'}
                                        />
                                    </div>
                                    <Tag variant="filled">{type.requestable ? 'Requestable' : 'Internal'}</Tag>
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
                        name="name"
                        label="Request name"
                        rules={[{ required: true, min: 3 }]}>
                        <Input placeholder="e.g. APAC 7 Step setup" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="startDate" label="From" rules={[{ required: true }]}>
                            <Input type="date" prefix={<CalendarOutlined />} />
                        </Form.Item>
                        <Form.Item
                            name="endDate"
                            label="To"
                            dependencies={['startDate']}
                            rules={[
                                { required: true },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        return !value || value >= getFieldValue('startDate')
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
                        name="inventoryTypeId"
                        label="Equipment"
                        rules={[{ required: true }]}>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            options={state.inventoryTypes
                                .filter((type) => type.requestable)
                                .map((type) => ({
                                    value: type.id,
                                    label: `${type.name} · ${type.availableQuantity} available`,
                                    disabled: type.availableQuantity === 0,
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
                    <Form.Item label="Photos (optional)">
                        <PhotoSlots images={requestImages} onChange={setRequestImages} />
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
                        <label style={{ display: 'block', marginBottom: 7, fontWeight: 650 }}>
                            Photos
                        </label>
                        <PhotoSlots images={actionImages} onChange={setActionImages} />
                    </div>
                )}
            </Modal>

            <Modal
                title={detailRequest ? `REQ-${detailRequest.displayId} · ${detailRequest.name}` : 'Request'}
                open={Boolean(detailRequest)}
                onCancel={() => setDetailRequestId(null)}
                footer={null}>
                {detailRequest && (
                    <CommentsPanel
                        comments={detailRequest.comments}
                        onAdd={(message) => actions.addInventoryComment(detailRequest.id, message)}
                    />
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
