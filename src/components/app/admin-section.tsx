'use client';

import {
    AppstoreOutlined,
    EnvironmentOutlined,
    ExclamationCircleOutlined,
    HomeOutlined,
    LinkOutlined,
    TeamOutlined,
    UserSwitchOutlined,
} from '@ant-design/icons';
import {
    App,
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Switch,
    Table,
    Tag,
    type TableProps,
} from 'antd';
import { useState } from 'react';
import type { FailedEmail, User } from '@/domain/types';
import { useDemoStore } from '@/demo/store';
import { DriveImageUploader } from './drive-image-uploader';

type Manager = 'department' | 'place' | 'inventoryType' | 'link' | 'home';

export function AdminSection() {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [query, setQuery] = useState('');
    const [manager, setManager] = useState<Manager | null>(null);
    const [managerForm] = Form.useForm();
    const [imageDriveId, setImageDriveId] = useState<string | undefined>();
    const [failedEmailsOpen, setFailedEmailsOpen] = useState(false);
    const [failedEmails, setFailedEmails] = useState<FailedEmail[]>([]);

    const people = state.users.filter((user) =>
        [user.name, user.id, user.department].join(' ').toLowerCase().includes(query.toLowerCase()),
    );

    const columns: TableProps<User>['columns'] = [
        {
            title: 'Person',
            key: 'person',
            render: (_, user) => (
                <div>
                    <strong style={{ display: 'block', fontSize: 12 }}>{user.name}</strong>
                    <span style={{ color: '#85888f', fontSize: 10 }}>{user.id}</span>
                </div>
            ),
        },
        {
            title: 'Department',
            dataIndex: 'department',
            responsive: ['md'],
        },
        {
            title: 'Role',
            dataIndex: 'role',
            render: (role: string) => (
                <Tag color={role === 'admin' ? 'volcano' : 'default'}>{role}</Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, user) => (
                <Button
                    size="small"
                    disabled={user.id === state.currentUser.id}
                    onClick={() =>
                        void updateAccess(user.id, {
                            role: user.role === 'admin' ? 'member' : 'admin',
                        })
                    }>
                    {user.role === 'admin' ? 'Make member' : 'Make admin'}
                </Button>
            ),
        },
    ];

    const updateAccess = async (id: string, input: { role?: 'admin' | 'member' }) => {
        try {
            await actions.updateUserAccess(id, input);
            message.success('Access updated.');
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Update failed.');
        }
    };

    const openManager = (nextManager: Manager) => {
        setManager(nextManager);
        setImageDriveId(undefined);
        if (nextManager === 'home') {
            managerForm.setFieldsValue(state.homeContent);
        } else {
            managerForm.resetFields();
            managerForm.setFieldsValue({ requestable: true, totalQuantity: 1 });
        }
    };

    const openFailedEmails = async () => {
        setFailedEmailsOpen(true);
        try {
            const response = await fetch('/api/v1/admin/failed-emails');
            const body = (await response.json()) as { data: FailedEmail[] };
            setFailedEmails(body.data ?? []);
        } catch {
            message.error('Failed emails could not be loaded.');
        }
    };

    const saveManager = async (values: Record<string, unknown>) => {
        if (!manager) return;
        const config: Record<Manager, { path: string; method: 'POST' | 'PUT'; label: string }> = {
            department: { path: '/api/v1/departments', method: 'POST', label: 'Department' },
            place: { path: '/api/v1/places', method: 'POST', label: 'Place' },
            inventoryType: {
                path: '/api/v1/inventory-types',
                method: 'POST',
                label: 'Inventory type',
            },
            link: { path: '/api/v1/admin/links', method: 'POST', label: 'Quick link' },
            home: { path: '/api/v1/admin/home-content', method: 'PUT', label: 'Home content' },
        };
        try {
            const selected = config[manager];
            const payload =
                manager === 'home'
                    ? {
                          ...values,
                          whatsappUrl: values.whatsappUrl || '',
                          tutorialUrl: values.tutorialUrl || '',
                      }
                    : manager === 'inventoryType'
                      ? { ...values, imageDriveId }
                      : values;
            const response = await fetch(selected.path, {
                method: selected.method,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as {
                    error?: { message?: string };
                } | null;
                throw new Error(body?.error?.message ?? 'Save failed.');
            }
            setManager(null);
            message.success(`${selected.label} saved.`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Save failed.');
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Administration</p>
                    <h2>Keep the workspace clean and current.</h2>
                    <p>Manage access, master data and the content shown to the operations team.</p>
                </div>
            </div>

            <div className="admin-grid">
                <AdminTile
                    icon={<UserSwitchOutlined />}
                    title="People & access"
                    description={`${state.users.length} people with access from the org's Google domain.`}
                />
                <AdminTile
                    icon={<TeamOutlined />}
                    title="Departments"
                    description="Team ownership, contact points and roster grouping."
                    onClick={() => openManager('department')}
                />
                <AdminTile
                    icon={<EnvironmentOutlined />}
                    title="Places"
                    description="Studios, storage bays and program venues."
                    onClick={() => openManager('place')}
                />
                <AdminTile
                    icon={<AppstoreOutlined />}
                    title="Inventory types"
                    description={`${state.inventoryTypes.length} tracked equipment types and availability.`}
                    onClick={() => openManager('inventoryType')}
                />
                <AdminTile
                    icon={<LinkOutlined />}
                    title="Quick links"
                    description={`${state.links.length} operational resources displayed on Home.`}
                    onClick={() => openManager('link')}
                />
                <AdminTile
                    icon={<HomeOutlined />}
                    title="Home content"
                    description="Guidelines, support chat and booking tutorial links."
                    onClick={() => openManager('home')}
                />
                <AdminTile
                    icon={<ExclamationCircleOutlined />}
                    title="Failed emails"
                    description="Notifications that could not be delivered."
                    onClick={() => void openFailedEmails()}
                />
            </div>

            <Card className="surface-card" style={{ marginTop: 20 }}>
                <div className="card-heading">
                    <div>
                        <h3>People & access</h3>
                        <p>Anyone signing in from the org’s Google domain gets an account automatically</p>
                    </div>
                    <Input.Search
                        allowClear
                        placeholder="Search people"
                        style={{ width: 240 }}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={people}
                    pagination={{ pageSize: 5, hideOnSinglePage: true }}
                    scroll={{ x: 480 }}
                />
            </Card>

            <Modal
                title={managerTitle(manager)}
                open={Boolean(manager)}
                onCancel={() => setManager(null)}
                onOk={() => managerForm.submit()}
                okText="Save"
                destroyOnHidden>
                <Form form={managerForm} layout="vertical" onFinish={(values) => void saveManager(values)}>
                    {manager === 'department' && (
                        <>
                            <Form.Item
                                name="name"
                                label="Department name"
                                rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="shortName" label="Short name">
                                <Input />
                            </Form.Item>
                        </>
                    )}
                    {manager === 'place' && (
                        <Form.Item name="name" label="Place name" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                    )}
                    {manager === 'inventoryType' && (
                        <>
                            <Form.Item name="name" label="Type name" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="description" label="Description">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                            <Form.Item
                                name="requestable"
                                label="Members can request"
                                valuePropName="checked">
                                <Switch />
                            </Form.Item>
                            <Form.Item
                                name="totalQuantity"
                                label="Total quantity"
                                rules={[{ required: true }]}>
                                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item label="Photo">
                                <DriveImageUploader value={imageDriveId} onChange={setImageDriveId} />
                            </Form.Item>
                        </>
                    )}
                    {manager === 'link' && (
                        <>
                            <Form.Item name="name" label="Link name" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item
                                name="url"
                                label="URL"
                                rules={[{ required: true, type: 'url' }]}>
                                <Input />
                            </Form.Item>
                        </>
                    )}
                    {manager === 'home' && (
                        <>
                            <Form.Item
                                name="supportMessage"
                                label="Support message"
                                rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item
                                name="guidelines"
                                label="Guidelines"
                                rules={[{ required: true }]}>
                                <Input.TextArea rows={7} />
                            </Form.Item>
                            <Form.Item
                                name="whatsappUrl"
                                label="WhatsApp URL"
                                rules={[{ type: 'url' }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item
                                name="tutorialUrl"
                                label="Tutorial URL"
                                rules={[{ type: 'url' }]}>
                                <Input />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>

            <Modal
                title="Failed emails"
                open={failedEmailsOpen}
                onCancel={() => setFailedEmailsOpen(false)}
                footer={null}
                width={720}>
                <Table
                    rowKey="id"
                    dataSource={failedEmails}
                    pagination={{ pageSize: 5, hideOnSinglePage: true }}
                    columns={[
                        {
                            title: 'When',
                            dataIndex: 'timestamp',
                            render: (value: string) => new Date(value).toLocaleString(),
                        },
                        { title: 'To', dataIndex: ['user', 'name'] },
                        { title: 'Title', dataIndex: 'title' },
                        { title: 'Error', dataIndex: 'error' },
                    ]}
                />
            </Modal>
        </>
    );
}

function AdminTile({
    icon,
    title,
    description,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick?: () => void;
}) {
    return (
        <Card
            className="surface-card admin-tile"
            hoverable={Boolean(onClick)}
            onClick={onClick}
            role={onClick ? 'button' : undefined}>
            <div className="admin-tile-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{description}</p>
        </Card>
    );
}

function managerTitle(manager: Manager | null) {
    const titles: Record<Manager, string> = {
        department: 'Add department',
        place: 'Add place',
        inventoryType: 'Add inventory type',
        link: 'Add quick link',
        home: 'Edit Home content',
    };
    return manager ? titles[manager] : '';
}
