import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useCustomMutation, useDelete, useInvalidate, useList, useUpdate } from '@refinedev/core';
import { Button, Form as AntForm, Select, Space, Table, Tag, Typography } from 'antd';
import {
    ArrowLeftOutlined,
    CameraOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { generateRequestId } from '../ids';
import { api } from '../api';
import { navigateToInventoryRequests, refreshDashboard } from '../router';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { addScannedInventoryItem, findInventoryTypeByQrValue } from '../ui/inventory-qr';
import { prepareInventoryImage } from '../ui/inventory-image';
import { RequestImage } from '../ui/request-image';
import { QrScanner } from '../ui/qr-scanner';
import { ImageCamera } from '../ui/image-camera';
import { TableView } from '../ui/table-view';
import { DetailSection } from '../ui/detail-layout';
import { canApprove, canTransitionInventoryRequest } from '../workflows';
import { supabase } from '../supabase';
import { Activity, ParticipantsEditor } from './detail-activity';
import { DetailFields, DetailLayout, WorkflowActions } from './detail-shared';
import { ActionConfirmation, Empty, Modal, SaveFooter, TextField, useSave } from './refine-shared';
import { requesterOptionLabel } from './requests';

const error = (value: unknown) => showErrorAlert(value);

export function InventoryDetail({
    request,
    dashboard,
}: {
    request: InventoryRequestDTO;
    dashboard: DashboardPayload;
}) {
    const { mutateAsync: updateInventoryRequest } = useUpdate();
    const { mutateAsync: deleteInventoryRequest } = useDelete();
    const { mutateAsync: customMutate } = useCustomMutation();
    const invalidate = useInvalidate();
    const invalidateThisRequest = () =>
        invalidate({
            resource: 'inventory-requests',
            id: request.Id,
            invalidates: ['list', 'many', 'detail'],
        });
    const owner =
        request.UserId === dashboard.me.Email || request.participants.includes(dashboard.me.Email);
    const editable = canApprove(dashboard.me) || (owner && request.Status === 'draft');
    const deletable =
        ['draft', 'cancelled'].includes(request.Status) && (canApprove(dashboard.me) || owner);
    const [editing, setEditing] = useState(false);
    const [pendingAction, setPendingAction] = useState<InventoryRequestAction | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [pendingDeleteItemIndex, setPendingDeleteItemIndex] = useState<number | null>(null);
    const [itemIndex, setItemIndex] = useState<number | null>(null);
    const [itemOpen, setItemOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [itemError, setItemError] = useState('');
    const [imageId, setImageId] = useState(request.ImageId || '');
    const [imageUploading, setImageUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<InventoryItemDTO[]>(
        request.items.map((item) => ({ ...item })),
    );
    const [itemDraft, setItemDraft] = useState({
        InventoryTypeId: '',
        Quantity: 1,
        Condition: '' as ReturnCondition | '',
    });
    const [values, setValues] = useState({
        Name: request.Name,
        StartDate: request.StartDate,
        EndDate: request.EndDate,
        DepartmentId: request.DepartmentId,
        LeadEmail: request.LeadEmail,
        Participants: request.participants.join(', '),
        UserId: request.UserId,
    });
    const { result: usersResult } = useList<UserDTO>({
        resource: 'users',
        pagination: { mode: 'off' },
        queryOptions: { enabled: canApprove(dashboard.me) },
    });
    const users = usersResult.data;
    const update = (key: keyof typeof values, value: string) =>
        setValues((current) => ({ ...current, [key]: value }));
    const persistItems = async (nextItems: InventoryItemDTO[]): Promise<boolean> => {
        const previousItems = items;
        try {
            setItemError('');
            showSavingBadge(true);
            setItems(nextItems);
            await updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    items: nextItems.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
            return true;
        } catch (e) {
            setItems(previousItems);
            setItemError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            showSavingBadge(false);
        }
    };
    const scanInventoryType = async (decodedValue: string) => {
        const inventoryType = findInventoryTypeByQrValue(dashboard.inventoryTypes, decodedValue);
        if (!inventoryType) {
            setItemError('Inventory type not found for this QR code.');
            return;
        }
        const saved = await persistItems(
            addScannedInventoryItem(items, inventoryType.Id).map((item) =>
                item.InventoryTypeId === inventoryType.Id && !item.itemName
                    ? { ...item, itemName: inventoryType.Name }
                    : item,
            ),
        );
        if (saved) setScanOpen(false);
    };
    const save = useSave(
        () =>
            updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    items: items.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            }).catch((e) => {
                setValues({
                    Name: request.Name,
                    StartDate: request.StartDate,
                    EndDate: request.EndDate,
                    DepartmentId: request.DepartmentId,
                    LeadEmail: request.LeadEmail,
                    Participants: request.participants.join(', '),
                    UserId: request.UserId,
                });
                setItems(request.items);
                throw e;
            }),
        () => setEditing(false),
    );
    const saveParticipants = async (participants: string[]) => {
        const serialized = participants.join(', ');
        showSavingBadge(true);
        try {
            await customMutate({
                url: 'updateInventoryRequestParticipants',
                method: 'post',
                values: {},
                meta: {
                    operation: 'updateInventoryRequestParticipants',
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
    const editItem = (index: number | null) => {
        setItemIndex(index);
        setItemError('');
        setItemDraft(
            index === null
                ? {
                      InventoryTypeId: '',
                      Quantity: 1,
                      Condition: '',
                  }
                : {
                      InventoryTypeId: items[index].InventoryTypeId,
                      Quantity: items[index].Quantity,
                      Condition: items[index].Condition,
                  },
        );
        setItemOpen(true);
    };
    const saveItem = async (event: FormEvent) => {
        event.preventDefault();
        if (!itemDraft.InventoryTypeId) {
            setItemError('Select an inventory type.');
            return;
        }
        if (itemDraft.Quantity <= 0) {
            setItemError('Quantity must be greater than zero.');
            return;
        }
        const type = dashboard.inventoryTypes.find(
            (entry) => entry.Id === itemDraft.InventoryTypeId,
        );
        if (!type) {
            setItemError('Select a valid inventory type.');
            return;
        }
        setItemError('');
        const nextItem = {
            ...itemDraft,
            itemName: type.Name,
        };
        const nextItems =
            itemIndex === null
                ? [...items, nextItem]
                : items.map((item, index) =>
                      index === itemIndex ? { ...item, ...nextItem } : item,
                  );
        setItemIndex(null);
        setItemOpen(false);
        await persistItems(nextItems);
    };
    const selectedInventoryType = dashboard.inventoryTypes.find(
        (type) => type.Id === itemDraft.InventoryTypeId,
    );
    const uploadRequestImage = async (file: File) => {
        if (!file) return;
        try {
            setImageUploading(true);
            showSavingBadge(true);
            const prepared = await prepareInventoryImage(file);
            const upload = await api.createImageUploadUrl(prepared.fileName, prepared.mimeType);
            const { error: uploadError } = await supabase()
                .storage.from('request-images')
                .uploadToSignedUrl(upload.path, upload.token, prepared.blob);
            if (uploadError) throw uploadError;
            const nextImageId = upload.path;
            setImageId(nextImageId);
            await updateInventoryRequest({
                resource: 'inventory-requests',
                id: request.Id,
                values: {
                    name: values.Name,
                    userId: values.UserId,
                    startDate: values.StartDate,
                    endDate: values.EndDate,
                    departmentId: values.DepartmentId,
                    leadEmail: values.LeadEmail,
                    participants: values.Participants,
                    imageId: nextImageId,
                    items: items.map((item) => ({
                        inventoryTypeId: item.InventoryTypeId,
                        quantity: item.Quantity,
                        condition: item.Condition,
                    })),
                },
                successNotification: false,
                errorNotification: false,
            });
            await refreshDashboard();
        } catch (e) {
            error(e);
        } finally {
            setImageUploading(false);
            showSavingBadge(false);
        }
    };
    const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadRequestImage(file);
    };
    const perform = async (action: InventoryRequestAction) => {
        try {
            showSavingBadge(true);
            await customMutate({
                url: 'performInventoryRequestAction',
                method: 'post',
                values: {},
                meta: {
                    operation: 'performInventoryRequestAction',
                    args: [request.Id, action, '', null, generateRequestId()],
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
    const actions = (
        ['submit', 'approve', 'reject', 'issue', 'close', 'cancel'] as InventoryRequestAction[]
    )
        .filter((action) => canTransitionInventoryRequest(request.Status, action))
        .filter(
            (action) =>
                action !== 'close' ||
                request.Status !== 'issued' ||
                (items.length > 0 && items.every((item) => Boolean(item.Condition))),
        )
        .filter((action) => (action === 'submit' ? owner : canApprove(dashboard.me)));
    return (
        <DetailLayout
            title={request.Name || 'Unnamed request'}
            action={
                <Space wrap>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={navigateToInventoryRequests}
                        aria-label="Back to inventory requests"
                        title="Back to inventory requests"
                    />
                    <WorkflowActions
                        actions={actions}
                        onAction={(action) => setPendingAction(action as InventoryRequestAction)}
                    />
                    {deletable && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setPendingDelete(true)}
                            aria-label="Delete request"
                            title="Delete request"
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
                            onClick={() => setEditing(true)}
                            aria-label="Edit request"
                            title="Edit request"
                        />
                    )
                }>
                <DetailFields
                    fields={[
                        ['Request number', `REQ-${request.DisplayId}`],
                        [
                            'Status',
                            <Tag color="blue" key="status">
                                {request.Status}
                            </Tag>,
                        ],
                        ['Request name', request.Name],
                        ['Start date', request.StartDate],
                        ['End date', request.EndDate],
                        ['Department', request.departmentName || 'None'],
                        ['Lead email', request.LeadEmail],
                        ['Requested by', request.userName || 'Unknown'],
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
                    title="Requested items"
                    count={items.length}
                    action={
                        editable && (
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<CameraOutlined />}
                                    onClick={() => {
                                        setItemError('');
                                        setScanOpen(true);
                                    }}
                                    aria-label="Scan requested item"
                                    title="Scan requested item"
                                />
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => editItem(null)}
                                    aria-label="Add item"
                                    title="Add item"
                                />
                            </Space>
                        )
                    }>
                    {items.length ? (
                        <Table
                            rowKey={(item) => `${item.InventoryTypeId}-${item.Quantity}`}
                            pagination={false}
                            dataSource={items}
                            columns={[
                                {
                                    title: 'Item',
                                    key: 'item',
                                    render: (_value: unknown, item: InventoryItemDTO) => (
                                        <Space size={6}>
                                            <Typography.Text type="secondary">
                                                {item.Quantity}×
                                            </Typography.Text>
                                            <Typography.Text strong>
                                                {item.itemName || 'Unknown item'}
                                            </Typography.Text>
                                        </Space>
                                    ),
                                },
                                {
                                    title: 'Condition',
                                    dataIndex: 'Condition',
                                    key: 'Condition',
                                    render: (value: string) => value || '—',
                                },
                                {
                                    title: 'Actions',
                                    key: 'actions',
                                    align: 'right' as const,
                                    render: (
                                        _value: unknown,
                                        _item: InventoryItemDTO,
                                        index: number,
                                    ) =>
                                        editable ? (
                                            <Space>
                                                <Button
                                                    type="text"
                                                    icon={<EditOutlined />}
                                                    onClick={() => editItem(index)}
                                                    aria-label="Edit item"
                                                />
                                                <Button
                                                    type="text"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => setPendingDeleteItemIndex(index)}
                                                    aria-label="Delete item"
                                                />
                                            </Space>
                                        ) : null,
                                },
                            ]}
                            className="inventory-items-table"
                            scroll={{ x: 'max-content' }}
                        />
                    ) : (
                        <Empty>No items added.</Empty>
                    )}
                </TableView>
            </DetailSection>
            <DetailSection
                title="Image"
                className="inventory-image-section"
                action={
                    editable && (
                        <>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageFileChange}
                            />
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<CameraOutlined />}
                                    loading={imageUploading}
                                    onClick={() => setCameraOpen(true)}
                                    aria-label={
                                        imageId ? 'Replace image with camera' : 'Take photo'
                                    }
                                    title={imageId ? 'Replace image with camera' : 'Take photo'}
                                />
                                <Button
                                    type="primary"
                                    icon={<UploadOutlined />}
                                    loading={imageUploading}
                                    onClick={() => imageInputRef.current?.click()}
                                    aria-label={imageId ? 'Replace image' : 'Add image'}
                                    title={imageId ? 'Replace image' : 'Add image'}
                                />
                            </Space>
                        </>
                    )
                }>
                <div className="inventory-request-image-frame">
                    <RequestImage
                        imageId={imageId}
                        alt="Inventory request"
                        className="inventory-request-image"
                        fallback={
                            <Typography.Text type="secondary">No image added.</Typography.Text>
                        }
                    />
                </div>
            </DetailSection>
            <DetailSection className="activity-detail-section">
                <Activity requestId={request.Id} initialComments={request.comments} />
            </DetailSection>
            {editing && (
                <Modal title="Edit inventory request" close={() => setEditing(false)}>
                    <form className="grid gap-3" noValidate onSubmit={save.run}>
                        <TextField
                            name="name"
                            label="Event / Purpose"
                            value={values.Name}
                            required
                            onChange={(e) => update('Name', e.target.value)}
                        />
                        <TextField
                            name="startDate"
                            label="Start date"
                            type="date"
                            value={values.StartDate}
                            required
                            onChange={(e) => update('StartDate', e.target.value)}
                        />
                        <TextField
                            name="endDate"
                            label="End date"
                            type="date"
                            value={values.EndDate}
                            required
                            onChange={(e) => update('EndDate', e.target.value)}
                        />
                        {canApprove(dashboard.me) && (
                            <AntForm.Item label="Requested by" required>
                                <input type="hidden" name="userId" value={values.UserId} required />
                                <Select
                                    value={values.UserId}
                                    onChange={(value) => update('UserId', value)}
                                    className="antd-full-width">
                                    {users.map((user) => (
                                        <Select.Option key={user.Email} value={user.Email}>
                                            {requesterOptionLabel(user)}
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
                                {dashboard.departments.map((department) => (
                                    <Select.Option key={department.Id} value={department.Id}>
                                        {department.Name}
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
            {scanOpen && (
                <Modal
                    title="Scan inventory type"
                    close={() => {
                        setScanOpen(false);
                        setItemError('');
                    }}>
                    <div className="grid gap-3">
                        <QrScanner onScan={scanInventoryType} />
                        {itemError && <Typography.Text type="danger">{itemError}</Typography.Text>}
                    </div>
                </Modal>
            )}
            {cameraOpen && (
                <Modal title="Take photo" close={() => setCameraOpen(false)}>
                    <ImageCamera
                        onCapture={async (file) => {
                            setCameraOpen(false);
                            await uploadRequestImage(file);
                        }}
                    />
                </Modal>
            )}
            {itemOpen && (
                <Modal
                    title={itemIndex === null ? 'Add item' : 'Edit item'}
                    close={() => {
                        setItemOpen(false);
                        setItemIndex(null);
                    }}>
                    <form className="grid gap-3" noValidate onSubmit={saveItem}>
                        <AntForm.Item label="Inventory type" required>
                            <Select
                                value={itemDraft.InventoryTypeId || undefined}
                                onChange={(value) =>
                                    setItemDraft((current) => ({
                                        ...current,
                                        InventoryTypeId: value,
                                    }))
                                }
                                className="antd-full-width"
                                placeholder="Select inventory type">
                                {dashboard.inventoryTypes.map((type) => (
                                    <Select.Option key={type.Id} value={type.Id}>
                                        {type.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                            {selectedInventoryType && (
                                <div className="inventory-type-detail-image mt-3">
                                    <RequestImage
                                        imageId={selectedInventoryType.ImageId}
                                        alt={selectedInventoryType.Name}
                                        fallback={<span>No photo</span>}
                                    />
                                </div>
                            )}
                        </AntForm.Item>
                        <TextField
                            name="quantity"
                            label="Quantity"
                            type="number"
                            value={itemDraft.Quantity}
                            required
                            onChange={(event) =>
                                setItemDraft((current) => ({
                                    ...current,
                                    Quantity: Number(event.target.value),
                                }))
                            }
                        />
                        <AntForm.Item label="Condition">
                            <Select
                                value={itemDraft.Condition}
                                disabled={!canApprove(dashboard.me)}
                                onChange={(value) =>
                                    setItemDraft((current) => ({
                                        ...current,
                                        Condition: value as ReturnCondition | '',
                                    }))
                                }
                                className="antd-full-width">
                                <Select.Option value="">Not specified</Select.Option>
                                <Select.Option value="returned">Returned</Select.Option>
                                <Select.Option value="damaged">Damaged</Select.Option>
                                <Select.Option value="missing">Missing</Select.Option>
                            </Select>
                        </AntForm.Item>
                        <div>
                            <SaveFooter label="Save" errorMessage={itemError} />
                        </div>
                    </form>
                </Modal>
            )}
            {pendingDeleteItemIndex !== null && (
                <ActionConfirmation
                    action="delete"
                    description="Are you sure you want to delete this item?"
                    onCancel={() => setPendingDeleteItemIndex(null)}
                    onConfirm={async () => {
                        const nextItems = items.filter(
                            (_, index) => index !== pendingDeleteItemIndex,
                        );
                        await persistItems(nextItems);
                        setPendingDeleteItemIndex(null);
                    }}
                />
            )}
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
                    description="Are you sure you want to delete this inventory request?"
                    onCancel={() => setPendingDelete(false)}
                    onConfirm={async () => {
                        try {
                            showSavingBadge(true);
                            await deleteInventoryRequest({
                                resource: 'inventory-requests',
                                id: request.Id,
                                successNotification: false,
                                errorNotification: false,
                            });
                            setPendingDelete(false);
                            await refreshDashboard();
                            navigateToInventoryRequests();
                        } catch (e) {
                            error(e);
                        } finally {
                            showSavingBadge(false);
                        }
                    }}
                />
            )}
        </DetailLayout>
    );
}
