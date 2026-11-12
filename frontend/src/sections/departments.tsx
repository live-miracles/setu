import { useState } from 'react';
import { useList } from '@refinedev/core';
import { Button, Empty, Input, Space, Tag, Typography } from 'antd';
import {
    ArrowLeftOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
    departmentPath,
    departmentsPath,
    inventoryRequestPath,
    programRequestPath,
    userPath,
} from '../paths';
import { matchesSearch } from '../ui/search';
import { RelatedRequestBlocks } from '../ui/related-request-blocks';
import { useRelatedRequests } from '../ui/related-requests';
import { UserBlock } from '../ui/user-block';
import { BlockCard } from '../ui/block-card';
import { DetailSection, DetailSections } from '../ui/detail-layout';
import { ActionConfirmation } from './refine-shared';
import {
    Editor,
    SettingsDetailFields,
    useResourceMutations,
    type ResourceConfig,
    type Row,
} from './settings-editor';
import { canManageConfig } from '../workflows';

const DEPARTMENT_CONFIG: ResourceConfig = {
    kind: 'department',
    title: 'Departments',
    addLabel: 'Add department',
    emptyMessage: 'No departments yet.',
    fields: [
        { field: 'Name', label: 'Name' },
        { field: 'ShortName', label: 'Short name' },
        { field: 'LeadEmail', label: 'Lead email', type: 'email' },
    ],
    toInput: (v) => ({ name: v.Name, shortName: v.ShortName, leadEmail: v.LeadEmail }),
};

export function DepartmentsPage({ dashboard }: { dashboard: DashboardPayload }) {
    const config = DEPARTMENT_CONFIG;
    const navigate = useNavigate();
    const { id: detailId = null } = useParams<{ id: string }>();
    const canEdit = canManageConfig(dashboard.me);
    const [editing, setEditing] = useState<Row | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Row | null>(null);
    const { result, query } = useList({ resource: 'departments', pagination: { mode: 'off' } });
    const rows = result.data as Row[];
    const { save, remove } = useResourceMutations('departments', config);
    const selectedDepartment = rows.find((row) => row.Id === detailId) || null;
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const filteredRows = rows.filter((row) => matchesSearch(appliedSearch, Object.values(row)));
    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };

    const departmentFilter = selectedDepartment
        ? { departmentId: String(selectedDepartment.Id) }
        : null;
    const departmentPrograms = useRelatedRequests<ProgramRequestDTO>(
        'program-requests',
        departmentFilter,
    );
    const departmentInventoryRequests = useRelatedRequests<InventoryRequestDTO>(
        'inventory-requests',
        departmentFilter,
    );
    const departmentUsers = selectedDepartment
        ? dashboard.users.filter((user) => user.DepartmentId === selectedDepartment.Id)
        : [];

    const departmentCards = query.isLoading ? (
        <div className="py-8 text-center">
            <Typography.Text type="secondary">Loading…</Typography.Text>
        </div>
    ) : filteredRows.length > 0 ? (
        <div className="department-list">
            {filteredRows.map((row) => (
                <BlockCard
                    key={row.Id}
                    className="department-card"
                    href={departmentPath(String(row.Id))}
                    onClick={() => navigate(departmentPath(String(row.Id)))}>
                    <div className="department-card-content">
                        <strong>
                            {String(row.Name || 'Unnamed department')}
                            {row.ShortName ? ` (${String(row.ShortName)})` : ''}
                        </strong>
                        <span>{String(row.LeadEmail || 'No lead email')}</span>
                    </div>
                </BlockCard>
            ))}
        </div>
    ) : (
        <Empty description={config.emptyMessage} />
    );
    const departmentHeader = (
        <div className="antd-page-heading resource-page-heading">
            <div>
                <Typography.Title level={2}>{config.title}</Typography.Title>
            </div>
            <Space className="antd-board-filters" wrap>
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder={`Search ${config.title.toLowerCase()}`}
                    aria-label={`Search ${config.title.toLowerCase()}`}
                    value={search}
                    onChange={(event) => {
                        const value = event.target.value;
                        setSearch(value);
                        if (!value) setAppliedSearch('');
                    }}
                    onPressEnter={() => setAppliedSearch(search)}
                />
                <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={() => setAppliedSearch(search)}
                    aria-label={`Search ${config.title.toLowerCase()}`}
                    title={`Search ${config.title.toLowerCase()}`}
                />
            </Space>
            {canEdit && (
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreating(true)}
                    aria-label={`Add ${config.kind}`}
                    title={`Add ${config.kind}`}
                />
            )}
        </div>
    );
    const departmentDetail = selectedDepartment && (
        <>
            <div className="antd-page-heading">
                <div>
                    <Typography.Title level={2}>
                        {String(selectedDepartment.Name || 'Unnamed department')}
                        {selectedDepartment.ShortName
                            ? ` (${String(selectedDepartment.ShortName)})`
                            : ''}
                    </Typography.Title>
                </div>
                <Space>
                    <Button
                        type="default"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate(departmentsPath, { replace: true })}
                        aria-label="Back to departments"
                        title="Back to departments"
                    />
                    {canEdit && (
                        <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeleting(selectedDepartment)}
                            aria-label="Delete department"
                            title="Delete department"
                        />
                    )}
                </Space>
            </div>
            <DetailSections>
                <DetailSection
                    title="Details"
                    action={
                        canEdit ? (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => setEditing(selectedDepartment)}
                                aria-label="Edit department"
                                title="Edit department"
                            />
                        ) : null
                    }>
                    <SettingsDetailFields
                        fields={[
                            ['Name', String(selectedDepartment.Name || 'Unnamed department')],
                            ['Short name', String(selectedDepartment.ShortName || '—')],
                            ['Lead email', String(selectedDepartment.LeadEmail || '—')],
                        ]}
                    />
                </DetailSection>
                {departmentUsers.length > 0 && (
                    <DetailSection span="full">
                        <section className="related-list">
                            <div className="related-request-heading">
                                <Typography.Title level={3}>
                                    Users <Tag>{departmentUsers.length}</Tag>
                                </Typography.Title>
                            </div>
                            <div className="department-related-grid">
                                {departmentUsers.map((user) => (
                                    <UserBlock
                                        key={user.Email}
                                        user={user}
                                        dashboard={dashboard}
                                        href={userPath(user.Email)}
                                        onClick={() => navigate(userPath(user.Email))}
                                    />
                                ))}
                            </div>
                        </section>
                    </DetailSection>
                )}
                {departmentPrograms.total > 0 && (
                    <DetailSection span="full">
                        <RelatedRequestBlocks
                            title="Programs"
                            kind="program"
                            items={departmentPrograms.items}
                            total={departmentPrograms.total}
                            dashboard={dashboard}
                            hrefFor={programRequestPath}
                            onOpen={(id) => navigate(programRequestPath(id))}
                        />
                    </DetailSection>
                )}
                {departmentInventoryRequests.total > 0 && (
                    <DetailSection span="full">
                        <RelatedRequestBlocks
                            title="Inventory requests"
                            kind="inventory"
                            items={departmentInventoryRequests.items}
                            total={departmentInventoryRequests.total}
                            dashboard={dashboard}
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    </DetailSection>
                )}
            </DetailSections>
        </>
    );
    return (
        <section className={`antd-page${selectedDepartment ? ' detail-page' : ''}`}>
            {selectedDepartment ? (
                departmentDetail
            ) : (
                <>
                    {departmentHeader}
                    {departmentCards}
                </>
            )}
            {deleting && (
                <ActionConfirmation
                    action="delete"
                    description={`Delete “${deleting[config.fields[0].field]}”?`}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async () => {
                        const row = deleting;
                        setDeleting(null);
                        const removed = await remove(row);
                        if (!removed) return;
                        navigate(departmentsPath, { replace: true });
                    }}
                />
            )}
            {canEdit && (creating || editing) && (
                <Editor
                    config={config}
                    row={editing || undefined}
                    onClose={closeEditor}
                    onSaved={async (values) => {
                        await save(values, editing);
                    }}
                />
            )}
        </section>
    );
}
