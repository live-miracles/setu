import { useState } from 'react';
import { useDelete, useList, useUpdate } from '@refinedev/core';
import { Button, Form as AntForm, Input, Select, Space, Typography } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import {
    navigateBackToSection,
    navigateToInventoryRequest,
    navigateToProgram,
    navigateToUser,
    programRequestUrl,
    inventoryRequestUrl,
    refreshDashboard,
    userUrl,
} from '../router';
import { USER_QUERY_PARAM } from '../config';
import { matchesSearch } from '../ui/search';
import { roleLabel } from '../ui/styles';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { DetailSection } from '../ui/detail-layout';
import { UserBlock } from '../ui/user-block';
import { DetailFields, DetailLayout } from './detail-shared';
import { canManageConfig } from '../workflows';
import {
    ActionConfirmation,
    Empty,
    Modal,
    Page,
    SaveFooter,
    TextField,
    useSave,
} from './refine-shared';
import {
    isValidInternationalPhone,
    INTERNATIONAL_PHONE_PATTERN,
    INTERNATIONAL_PHONE_TITLE,
} from './form-utils';

type Props = { dashboard: DashboardPayload };

export function UserForm({
    dashboard,
    user,
    close,
}: {
    dashboard: DashboardPayload;
    user: UserDTO;
    close: () => void;
}) {
    const [role, setRole] = useState<UserRole>(user.Role);
    const [departmentId, setDepartmentId] = useState(user.DepartmentId);
    const { mutateAsync: updateUser } = useUpdate();
    const save = useSave(async () => {
        const d = new FormData(document.getElementById('refine-user-form') as HTMLFormElement);
        const values = {
            name: String(d.get('name')),
            role: String(d.get('role')) as UserRole,
            departmentId: String(d.get('departmentId') || ''),
            phone: String(d.get('phone') || ''),
            whatsapp: String(d.get('whatsapp') || ''),
        };
        if (!isValidInternationalPhone(values.phone)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        if (!isValidInternationalPhone(values.whatsapp)) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        await updateUser({
            resource: 'users',
            id: user.Email,
            values,
            successNotification: false,
            errorNotification: false,
        });
    }, close);
    return (
        <Modal title="Edit user" close={close}>
            <form id="refine-user-form" className="grid gap-3" noValidate onSubmit={save.run}>
                <TextField name="name" label="Name" value={user.Name} required />
                <AntForm.Item label="Role" required>
                    <input type="hidden" name="role" value={role} required />
                    <Select value={role} onChange={setRole} style={{ width: '100%' }}>
                        {(['admin', 'approver', 'viewer', 'user'] as UserRole[]).map((r) => (
                            <Select.Option key={r} value={r}>
                                {roleLabel(r)}
                            </Select.Option>
                        ))}
                    </Select>
                </AntForm.Item>
                <AntForm.Item label="Department" required>
                    <input type="hidden" name="departmentId" value={departmentId} required />
                    <Select
                        value={departmentId}
                        onChange={setDepartmentId}
                        style={{ width: '100%' }}>
                        <Select.Option value="" disabled>
                            Select a department
                        </Select.Option>
                        {dashboard.departments.map((d) => (
                            <Select.Option key={d.Id} value={d.Id}>
                                {d.Name}
                            </Select.Option>
                        ))}
                    </Select>
                </AntForm.Item>
                <TextField
                    name="phone"
                    label="Phone"
                    type="tel"
                    value={user.Phone}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <TextField
                    name="whatsapp"
                    label="WhatsApp"
                    type="tel"
                    value={user.Whatsapp}
                    required
                    pattern={INTERNATIONAL_PHONE_PATTERN}
                    title={INTERNATIONAL_PHONE_TITLE}
                />
                <div>
                    <SaveFooter label="Save" busy={save.busy} errorMessage={save.errorMessage} />
                </div>
            </form>
        </Modal>
    );
}
export function Users({ dashboard }: Props) {
    const [editing, setEditing] = useState<UserDTO | undefined>();
    const [deleting, setDeleting] = useState<UserDTO | null>(null);
    const { mutateAsync: deleteUser } = useDelete();
    const { result } = useList({ resource: 'users', pagination: { mode: 'off' } });
    const users = result.data as UserDTO[];
    const selectedUserId = new URLSearchParams(window.location.search).get(USER_QUERY_PARAM);
    const selectedUser = selectedUserId
        ? users.find((user) => user.Email === selectedUserId) || null
        : null;
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const shown = users;
    const filteredUsers = shown.filter((user) =>
        matchesSearch(appliedSearch, [
            user.Name,
            user.Email,
            user.departmentName,
            user.Role,
            user.Phone,
            user.Whatsapp,
        ]),
    );
    const userPrograms = selectedUser
        ? dashboard.programRequests.filter((request) => request.UserId === selectedUser.Email)
        : [];
    const userInventoryRequests = selectedUser
        ? dashboard.inventoryRequests.filter((request) => request.UserId === selectedUser.Email)
        : [];
    const userHeader = (
        <div className="antd-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>Users</Typography.Title>
            </div>
            <Space className="antd-board-filters" wrap>
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="Search users"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={() => setAppliedSearch(search)}
                    aria-label="Search users"
                    title="Search users"
                />
            </Space>
        </div>
    );
    const userDetail = selectedUser && (
        <DetailLayout
            title={selectedUser.Name}
            action={
                <Space>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigateBackToSection('users')}
                        aria-label="Back to users"
                        title="Back to users"
                    />
                    {canManageConfig(dashboard.me) && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeleting(selectedUser)}
                            aria-label="Delete user"
                            title="Delete user"
                        />
                    )}
                </Space>
            }>
            <DetailSection
                title="Details"
                action={
                    canManageConfig(dashboard.me) ? (
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => setEditing(selectedUser)}
                            aria-label="Edit user"
                            title="Edit user"
                        />
                    ) : null
                }>
                <DetailFields
                    fields={[
                        ['Email', selectedUser.Email],
                        ['Department', selectedUser.departmentName || 'No department'],
                        ['Role', roleLabel(selectedUser.Role)],
                        ['Phone', selectedUser.Phone || '—'],
                        ['WhatsApp', selectedUser.Whatsapp || '—'],
                    ]}
                />
            </DetailSection>
            <DetailSection span="full">
                <RelatedRequestBlocks
                    title="Programs"
                    kind="program"
                    items={userPrograms}
                    dashboard={dashboard}
                    emptyMessage="No program requests from this user."
                    hrefFor={programRequestUrl}
                    onOpen={navigateToProgram}
                />
            </DetailSection>
            <DetailSection span="full">
                <RelatedRequestBlocks
                    title="Inventory requests"
                    kind="inventory"
                    items={userInventoryRequests}
                    dashboard={dashboard}
                    emptyMessage="No inventory requests from this user."
                    hrefFor={inventoryRequestUrl}
                    onOpen={navigateToInventoryRequest}
                />
            </DetailSection>
        </DetailLayout>
    );
    return (
        <>
            {selectedUser ? (
                userDetail
            ) : (
                <Page title="Users" hideHeading className="users-list-page">
                    {userHeader}
                    {filteredUsers.length ? (
                        <div className="user-card-list">
                            {filteredUsers.map((user) => (
                                <UserBlock
                                    key={user.Email}
                                    user={user}
                                    dashboard={dashboard}
                                    href={userUrl(user.Email)}
                                    onClick={() => navigateToUser(user.Email)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty>No users yet.</Empty>
                    )}
                </Page>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Are you sure you want to delete ${deleting.Name}?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await deleteUser({
                            resource: 'users',
                            id: deleting.Email,
                            successNotification: false,
                            errorNotification: false,
                        });
                        setDeleting(null);
                        await refreshDashboard();
                    }}
                />
            )}
            {editing && (
                <UserForm
                    dashboard={dashboard}
                    user={editing}
                    close={() => setEditing(undefined)}
                />
            )}
        </>
    );
}
