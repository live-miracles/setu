import { useState } from 'react';
import { useList } from '../ui/resources';
import { useMe, useUsers } from '../ui/reference';
import { ListHeading, SearchBox } from '../ui/list-heading';
import { Button, Empty, Space, Tag, Typography } from '../ui/kit';
import { Icon } from '../ui/icons';
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
import { DetailBackButton, DetailHeading, MasterDetail } from '../ui/master-detail';
import { ActionConfirmation } from './action-confirmation';
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

export function DepartmentsPage() {
    const config = DEPARTMENT_CONFIG;
    const navigate = useNavigate();
    const { id: detailId = null } = useParams<{ id: string }>();
    const canEdit = canManageConfig(useMe());
    const users = useUsers();
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
        ? users.filter((user) => user.DepartmentId === selectedDepartment.Id)
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
                    selected={row.Id === detailId}
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
        <ListHeading
            title={<Typography.Title level={2}>{config.title}</Typography.Title>}
            actions={
                canEdit && (
                    <Button
                        type="primary"
                        icon={<Icon name="plus" />}
                        onClick={() => setCreating(true)}
                        aria-label={`Add ${config.kind}`}
                        title={`Add ${config.kind}`}
                    />
                )
            }>
            <SearchBox
                noun={config.title.toLowerCase()}
                value={search}
                onChange={(value) => {
                    setSearch(value);
                    if (!value) setAppliedSearch('');
                }}
                onSubmit={() => setAppliedSearch(search)}
            />
        </ListHeading>
    );
    const departmentDetail = selectedDepartment && (
        <>
            <DetailHeading
                title={`${String(selectedDepartment.Name || 'Unnamed department')}${
                    selectedDepartment.ShortName ? ` (${String(selectedDepartment.ShortName)})` : ''
                }`}
                actions={
                    <Space>
                        <DetailBackButton
                            label={config.title}
                            onClick={() => navigate(departmentsPath, { replace: true })}
                        />
                        {canEdit && (
                            <Button
                                type="primary"
                                danger
                                icon={<Icon name="trash" />}
                                onClick={() => setDeleting(selectedDepartment)}
                                aria-label="Delete department"
                                title="Delete department"
                            />
                        )}
                    </Space>
                }
            />
            <DetailSections>
                <DetailSection
                    title="Details"
                    action={
                        canEdit ? (
                            <Button
                                type="primary"
                                icon={<Icon name="edit" />}
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
                            hrefFor={inventoryRequestPath}
                            onOpen={(id) => navigate(inventoryRequestPath(id))}
                        />
                    </DetailSection>
                )}
            </DetailSections>
        </>
    );
    return (
        <MasterDetail
            heading={departmentHeader}
            list={departmentCards}
            detail={departmentDetail}
            detailKey={String(selectedDepartment?.Id ?? '')}>
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
        </MasterDetail>
    );
}
