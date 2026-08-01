'use client';

import {
    EnvironmentOutlined,
    PhoneOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    TeamOutlined,
    UserOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Form, Input, Modal, Tag } from 'antd';
import { useState } from 'react';
import { useDemoStore } from '@/demo/store';
import type { SectionKey } from './workspace-app';

export function ProfileSection({ onNavigate }: { onNavigate?: (section: SectionKey) => void }) {
    const { state, actions } = useDemoStore();
    const { message } = App.useApp();
    const [editOpen, setEditOpen] = useState(false);
    const [form] = Form.useForm();
    const user = state.currentUser;

    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Personal settings</p>
                    <h2>Your operations identity.</h2>
                    <p>Contact details and team assignment.</p>
                </div>
                <div className="page-actions">
                    <Button type="primary" onClick={() => setEditOpen(true)}>
                        Edit profile
                    </Button>
                </div>
            </div>

            <div className="profile-grid">
                <Card className="surface-card profile-card">
                    <h2>{user.name}</h2>
                    <p>{user.id}</p>
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
                                <h3>Account security</h3>
                                <p>Managed through your Google account</p>
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
                                    Google sign-in
                                </strong>
                                <span style={{ color: '#7d8087', fontSize: 11 }}>
                                    Your access is active. Updates are sent to this email address.
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
