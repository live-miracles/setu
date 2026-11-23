import { useState } from 'react';
import { useCreate, useDelete, useList, useUpdate } from '../ui/resources';
import { Input, Select, Field } from '../ui/form-kit';
import { Button, Empty, Space, Typography } from '../ui/kit';
import { Controller, useForm } from 'react-hook-form';
import { Icon } from '../ui/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useDepartments, useMe } from '../ui/reference';
import {
    departmentPath,
    inventoryRequestPath,
    programRequestPath,
    userPath,
    usersPath,
} from '../paths';
import { matchesSearch } from '../ui/search';
import { roleLabel } from '../ui/styles';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { useRelatedRequests } from '../ui/related-requests';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { DetailBackButton, DetailHeading, MasterDetail } from '../ui/master-detail';
import { UserBlock } from '../ui/user-block';
import { DetailFields, DetailLink } from './detail-shared';
import { canManageConfig } from '../workflows';
import { Modal } from '../ui/overlay-kit';
import { ActionConfirmation } from './action-confirmation';
import { PhoneField, SaveFooter, TextField } from './form-fields';
import { useRHFSave } from './save-hooks';
import {
    internationalPhoneRules,
    isValidInternationalPhone,
    INTERNATIONAL_PHONE_TITLE,
} from './form-utils';

type UserFormValues = {
    email: string;
    name: string;
    role: UserRole;
    departmentId: string;
    phone: string;
    whatsapp: string;
};

const USER_ROLE_ORDER: Record<UserRole, number> = {
    admin: 0,
    approver: 1,
    viewer: 2,
    user: 3,
};

// Without `user` the form adds a member who has no organisation email yet.
// Such a member (SignInBlocked) can be given their work email later, which
// lets them sign in with Google and keeps everything already linked to them.
export function UserForm({ user, close }: { user?: UserDTO; close: () => void }) {
    const departments = useDepartments();
    const form = useForm<UserFormValues>({
        defaultValues: {
            email: user?.Email ?? '',
            name: user?.Name ?? '',
            role: user?.Role ?? 'user',
            departmentId: user?.DepartmentId ?? '',
            phone: user?.Phone ?? '',
            whatsapp: user?.Whatsapp ?? '',
        },
    });
    const { mutateAsync: createUser } = useCreate();
    const { mutateAsync: updateUser } = useUpdate();
    const editableEmail = !user || user.SignInBlocked;
    const save = useRHFSave(form, async (values) => {
        if (
            !isValidInternationalPhone(values.phone) ||
            !isValidInternationalPhone(values.whatsapp)
        ) {
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        if (user) {
            const { email, ...rest } = values;
            await updateUser({
                resource: 'users',
                id: user.Email,
                values: editableEmail ? { ...rest, email } : rest,
            });
        } else {
            await createUser({ resource: 'users', values });
        }
        close();
    });
    return (
        <Modal title={user ? 'Edit user' : 'Add member'} close={close}>
            <form className="grid gap-3" noValidate onSubmit={save.onSubmit}>
                {!user && (
                    <Typography.Text type="secondary">
                        Add a member who has no organisation email yet so they can be rostered. They
                        cannot sign in until you set their work email.
                    </Typography.Text>
                )}
                {editableEmail && (
                    <TextField
                        name="email"
                        label={user ? 'Work email' : 'Email'}
                        value={user?.Email}
                        type="email"
                        required
                        registration={form.register('email', { required: 'Email is required' })}
                        error={form.formState.errors.email?.message}
                    />
                )}
                <TextField
                    name="name"
                    label="Name"
                    value={user?.Name}
                    required
                    registration={form.register('name', { required: 'Name is required' })}
                    error={form.formState.errors.name?.message}
                />
                <Field label="Role" required>
                    <Controller
                        name="role"
                        control={form.control}
                        rules={{ required: 'Role is required' }}
                        render={({ field }) => (
                            <Select {...field} className="w-full">
                                {(['admin', 'approver', 'viewer', 'user'] as UserRole[]).map(
                                    (r) => (
                                        <Select.Option key={r} value={r}>
                                            {roleLabel(r)}
                                        </Select.Option>
                                    ),
                                )}
                            </Select>
                        )}
                    />
                </Field>
                <Field label="Department" required>
                    <Controller
                        name="departmentId"
                        control={form.control}
                        rules={{ required: 'Department is required' }}
                        render={({ field }) => (
                            <Select {...field} className="w-full" showSearch>
                                <Select.Option value="" disabled>
                                    Select a department
                                </Select.Option>
                                {departments.map((d) => (
                                    <Select.Option key={d.Id} value={d.Id}>
                                        {d.Name}
                                    </Select.Option>
                                ))}
                            </Select>
                        )}
                    />
                </Field>
                <Controller
                    name="phone"
                    control={form.control}
                    rules={internationalPhoneRules('Phone')}
                    render={({ field }) => (
                        <PhoneField
                            name={field.name}
                            label="Phone"
                            value={field.value}
                            onChange={field.onChange}
                            error={form.formState.errors.phone?.message}
                        />
                    )}
                />
                <Controller
                    name="whatsapp"
                    control={form.control}
                    rules={internationalPhoneRules('WhatsApp')}
                    render={({ field }) => (
                        <PhoneField
                            name={field.name}
                            label="WhatsApp"
                            value={field.value}
                            onChange={field.onChange}
                            error={form.formState.errors.whatsapp?.message}
                        />
                    )}
                />
                <div>
                    <SaveFooter label="Save" busy={save.busy} errorMessage={save.errorMessage} />
                </div>
            </form>
        </Modal>
    );
}
export function Users() {
    const navigate = useNavigate();
    const canManage = canManageConfig(useMe());
    const { email: selectedUserId = null } = useParams<{ email: string }>();
    const [editing, setEditing] = useState<UserDTO | undefined>();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<UserDTO | null>(null);
    const { mutateAsync: deleteUser } = useDelete();
    const { result } = useList({ resource: 'users', pagination: { mode: 'off' } });
    const users = result.data as UserDTO[];
    const selectedUser = selectedUserId
        ? users.find((user) => user.Email === selectedUserId) || null
        : null;
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const shown = [...users].sort(
        (left, right) =>
            USER_ROLE_ORDER[left.Role] - USER_ROLE_ORDER[right.Role] ||
            left.Name.localeCompare(right.Name, undefined, { sensitivity: 'base' }),
    );
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
    const userFilter = selectedUser ? { requesterEmail: selectedUser.Email } : null;
    const userPrograms = useRelatedRequests<ProgramRequestDTO>('program-requests', userFilter);
    const userInventoryRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        userFilter,
    );
    const userHeader = (
        <div className="app-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>Users</Typography.Title>
            </div>
            <Space className="board-filters" wrap>
                <Input
                    allowClear
                    prefix={<Icon name="search" />}
                    placeholder="Search users"
                    aria-label="Search users"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onPressEnter={() => setAppliedSearch(search)}
                />
                <Button
                    type="primary"
                    icon={<Icon name="search" />}
                    onClick={() => setAppliedSearch(search)}
                    aria-label="Search users"
                    title="Search users"
                />
                {canManage && (
                    <Button
                        type="primary"
                        icon={<Icon name="plus" />}
                        onClick={() => setCreating(true)}
                        aria-label="Add member"
                        title="Add member"
                    />
                )}
            </Space>
        </div>
    );
    const userDetail = selectedUser && (
        <>
            <DetailHeading
                title={selectedUser.Name}
                actions={
                    <Space>
                        <DetailBackButton
                            label="Users"
                            onClick={() => navigate(usersPath, { replace: true })}
                        />
                        {canManage && (
                            <Button
                                type="primary"
                                danger
                                icon={<Icon name="trash" />}
                                onClick={() => setDeleting(selectedUser)}
                                aria-label="Delete user"
                                title="Delete user"
                            />
                        )}
                    </Space>
                }
            />
            <DetailSections>
                <DetailSection
                    title="Details"
                    action={
                        canManage ? (
                            <Button
                                type="primary"
                                icon={<Icon name="edit" />}
                                onClick={() => setEditing(selectedUser)}
                                aria-label="Edit user"
                                title="Edit user"
                            />
                        ) : null
                    }>
                    <DetailFields
                        fields={[
                            [
                                'Email',
                                selectedUser.SignInBlocked
                                    ? `${selectedUser.Email} (cannot sign in until a work email is set)`
                                    : selectedUser.Email,
                            ],
                            [
                                'Department',
                                selectedUser.DepartmentId ? (
                                    <DetailLink to={departmentPath(selectedUser.DepartmentId)}>
                                        {selectedUser.departmentName}
                                    </DetailLink>
                                ) : (
                                    'No department'
                                ),
                            ],
                            ['Role', roleLabel(selectedUser.Role)],
                            ['Phone', selectedUser.Phone || '—'],
                            ['WhatsApp', selectedUser.Whatsapp || '—'],
                        ]}
                    />
                </DetailSection>
                {userPrograms.total > 0 && (
                    <DetailSection span="full">
                        <RelatedRequestBlocks
                            title="Programs"
                            kind="program"
                            items={userPrograms.items}
                            total={userPrograms.total}
                            hrefFor={programRequestPath}
                            onOpen={(id) => navigate(programRequestPath(id))}
                        />
                    </DetailSection>
                )}
                {userInventoryRequests.total > 0 && (
                    <DetailSection span="full">
                        <RelatedRequestBlocks
                            title="Inventory requests"
                            kind="inventory"
                            items={userInventoryRequests.items}
                            total={userInventoryRequests.total}
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    </DetailSection>
                )}
            </DetailSections>
        </>
    );
    const userList = filteredUsers.length ? (
        <div className="user-card-list">
            {filteredUsers.map((user) => (
                <UserBlock
                    key={user.Email}
                    user={user}
                    href={userPath(user.Email)}
                    selected={user.Email === selectedUserId}
                    onClick={() => navigate(userPath(user.Email))}
                />
            ))}
        </div>
    ) : (
        <Empty>No users yet.</Empty>
    );
    return (
        <>
            <MasterDetail
                heading={userHeader}
                list={userList}
                detail={userDetail}
                detailKey={selectedUser?.Email}
            />
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Are you sure you want to delete ${deleting.Name}?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        await deleteUser({
                            resource: 'users',
                            id: deleting.Email,
                        });
                        setDeleting(null);
                    }}
                />
            )}
            {creating && <UserForm close={() => setCreating(false)} />}
            {editing && <UserForm user={editing} close={() => setEditing(undefined)} />}
        </>
    );
}
