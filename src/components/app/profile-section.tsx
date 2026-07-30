'use client';

import {
    BellOutlined,
    CheckCircleOutlined,
    EnvironmentOutlined,
    MailOutlined,
    PhoneOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    TeamOutlined,
    UserOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import { App, Avatar, Button, Card, Divider, Form, Input, Modal, Switch, Tag } from 'antd';
import { useState } from 'react';
import { useDemoStore } from '@/demo/store';
import { subscribeCurrentDeviceToPush } from '@/lib/push-client';
import { initials } from './shared';
import type { SectionKey } from './workspace-app';

export function ProfileSection({ onNavigate }: { onNavigate?: (section: SectionKey) => void }) {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [editOpen, setEditOpen] = useState(false);
    const [form] = Form.useForm();
    const user = state.currentUser;

    const enablePush = async () => {
        if (!('Notification' in window)) {
            message.error('This browser does not support Web Push.');
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            message.warning('Push permission was not granted. Email remains enabled.');
            return;
        }
        try {
            await subscribeCurrentDeviceToPush();
            actions.enablePush();
            message.success('Web Push is enabled on this device.');
        } catch (error) {
            message.error(
                error instanceof Error ? error.message : 'Web Push could not be enabled.',
            );
        }
    };

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Personal settings</p>
                    <h2>Your operations identity.</h2>
                    <p>
                        Contact details, team assignment and delivery preferences for this device.
                    </p>
                </div>
                <div className="page-actions">
                    <Button type="primary" onClick={() => setEditOpen(true)}>
                        Edit profile
                    </Button>
                </div>
            </div>

            <div className="profile-grid">
                <Card className="surface-card profile-card">
                    <Avatar
                        size={88}
                        style={{
                            background: '#ff6257',
                            fontSize: 28,
                            fontWeight: 700,
                        }}>
                        {initials(user.name)}
                    </Avatar>
                    <h2>{user.name}</h2>
                    <p>{user.email}</p>
                    <Tag
                        color={user.role === 'admin' ? 'volcano' : 'default'}
                        variant="filled"
                        style={{ marginTop: 12 }}>
                        {user.role}
                    </Tag>
                    <div className="profile-facts">
                        <div className="profile-fact">
                            <span>
                                <TeamOutlined /> Department
                            </span>
                            <strong>{user.department}</strong>
                        </div>
                        <div className="profile-fact">
                            <span>
                                <EnvironmentOutlined /> Time zone
                            </span>
                            <strong>{user.timezone}</strong>
                        </div>
                        <div className="profile-fact">
                            <span>
                                <PhoneOutlined /> Phone
                            </span>
                            <strong>{user.phone ?? 'Not set'}</strong>
                        </div>
                        <div className="profile-fact">
                            <span>
                                <WhatsAppOutlined /> WhatsApp
                            </span>
                            <strong>{user.whatsapp ?? 'Not set'}</strong>
                        </div>
                    </div>
                </Card>

                <div className="list-stack">
                    <Card className="surface-card">
                        <div className="card-heading">
                            <div>
                                <h3>Notification channels</h3>
                                <p>Choose how important operations updates reach you</p>
                            </div>
                            <BellOutlined />
                        </div>

                        <NotificationRow
                            icon={<CheckCircleOutlined />}
                            title="In-app notifications"
                            description="Always on for assignments, approvals and tickets."
                            action={<Tag color="success">Always on</Tag>}
                        />
                        <Divider style={{ margin: '13px 0' }} />
                        <NotificationRow
                            icon={<MailOutlined />}
                            title="Email"
                            description="Reliable delivery even when the app is closed."
                            action={
                                <Switch checked={user.notificationPreferences.email} disabled />
                            }
                        />
                        <Divider style={{ margin: '13px 0' }} />
                        <NotificationRow
                            icon={<BellOutlined />}
                            title="Web Push"
                            description="Instant alerts on this phone or browser."
                            action={
                                user.notificationPreferences.push ? (
                                    <Tag color="success">Enabled</Tag>
                                ) : (
                                    <Button size="small" onClick={() => void enablePush()}>
                                        Enable
                                    </Button>
                                )
                            }
                        />
                    </Card>

                    <Card className="surface-card">
                        <div className="card-heading">
                            <div>
                                <h3>Account security</h3>
                                <p>Managed through your approved Google account</p>
                            </div>
                            <SafetyCertificateOutlined />
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: 16,
                                borderRadius: 16,
                                background: '#f6f5f1',
                            }}>
                            <span className="metric-icon">
                                <UserOutlined />
                            </span>
                            <div>
                                <strong style={{ display: 'block', fontSize: 13 }}>
                                    Google sign-in + allowlist
                                </strong>
                                <span style={{ color: '#7d8087', fontSize: 11 }}>
                                    Your access is active. Contact an admin if your account changes.
                                </span>
                            </div>
                        </div>
                        <Button
                            danger
                            style={{ marginTop: 16 }}
                            onClick={async () => {
                                const response = await fetch('/api/v1/auth/logout', {
                                    method: 'POST',
                                });
                                if (response.ok) window.location.assign('/login');
                                else message.error('Sign out failed.');
                            }}>
                            Sign out
                        </Button>
                        {user.role === 'admin' && onNavigate && (
                            <Button
                                icon={<SettingOutlined />}
                                style={{ marginTop: 16, marginLeft: 8 }}
                                onClick={() => onNavigate('admin')}>
                                Open Admin
                            </Button>
                        )}
                    </Card>
                </div>
            </div>

            <Modal
                title="Edit profile"
                open={editOpen}
                onCancel={() => setEditOpen(false)}
                onOk={() => form.submit()}
                okText="Save changes">
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        name: user.name,
                        phone: user.phone,
                        whatsapp: user.whatsapp,
                        timezone: user.timezone,
                    }}
                    onFinish={async (values) => {
                        try {
                            await actions.updateProfile(values);
                            setEditOpen(false);
                            message.success('Profile updated.');
                        } catch (error) {
                            message.error(
                                error instanceof Error ? error.message : 'Update failed.',
                            );
                        }
                    }}>
                    <Form.Item name="name" label="Display name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="phone" label="Phone">
                        <Input prefix={<PhoneOutlined />} />
                    </Form.Item>
                    <Form.Item name="whatsapp" label="WhatsApp">
                        <Input prefix={<WhatsAppOutlined />} />
                    </Form.Item>
                    <Form.Item name="timezone" label="Time zone">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}

function NotificationRow({
    icon,
    title,
    description,
    action,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    action: React.ReactNode;
}) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '36px minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
            }}>
            <span className="metric-icon">{icon}</span>
            <div>
                <strong style={{ display: 'block', fontSize: 13 }}>{title}</strong>
                <span style={{ color: '#868990', fontSize: 11 }}>{description}</span>
            </div>
            {action}
        </div>
    );
}
