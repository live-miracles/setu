import { useState, type ReactNode } from 'react';
import { useOne } from '@refinedev/core';
import { Button, Form as AntForm, Select, Space, Tag, Typography } from 'antd';
import { api } from '../api';
import { navigateToInventoryRequests, navigateToPrograms } from '../router';
import { mountRefinePage } from '../ui/refine';
import { roleLabel } from '../ui/styles';
import {
    isValidInternationalPhone,
    INTERNATIONAL_PHONE_PATTERN,
    INTERNATIONAL_PHONE_TITLE,
} from './form-utils';
import { Users } from './users';
import { Roster } from './roster';
import { CreateRecord, RequestTable } from './requests';
import { ProgramDetail } from './program-detail';
import { InventoryDetail } from './inventory-detail';
import { Card, Page, SaveFooter, TextField, useSave } from './refine-shared';
import { Home } from './home';
import { Calendar } from './calendar';

type Props = { dashboard: DashboardPayload };
function Profile({ dashboard, registration = false }: Props & { registration?: boolean }) {
    const me = dashboard.me;
    const [departmentId, setDepartmentId] = useState(me.DepartmentId);
    const save = useSave(
        async () => {
            const form = document.getElementById(
                registration ? 'registration-form' : 'profile-form',
            ) as HTMLFormElement;
            const d = new FormData(form);
            const phone = String(d.get('phone') || '');
            const departmentIdValue = String(d.get('departmentId') || '');
            if (!isValidInternationalPhone(phone)) {
                throw new Error(INTERNATIONAL_PHONE_TITLE);
            }
            const whatsapp = String(d.get('whatsapp') || '');
            if (!isValidInternationalPhone(whatsapp)) {
                throw new Error(INTERNATIONAL_PHONE_TITLE);
            }
            const profile = {
                name: String(d.get('name')),
                departmentId: departmentIdValue,
                phone,
                whatsapp,
            };
            await api.updateOwnProfile(profile);
        },
        undefined,
        false,
    );
    return (
        <Page title={registration ? 'Welcome' : 'Profile'} hideHeading>
            <Card
                title={
                    registration ? (
                        'Get started'
                    ) : (
                        <Space size="small" wrap>
                            <Typography.Text strong>{me.Name}</Typography.Text>
                            <Typography.Text type="secondary">{me.Email}</Typography.Text>
                            <Tag color="blue">{roleLabel(me.Role)}</Tag>
                        </Space>
                    )
                }
                className="profile-form-card">
                <form
                    id={registration ? 'registration-form' : 'profile-form'}
                    className="grid gap-3"
                    noValidate
                    onSubmit={save.run}>
                    <TextField name="name" label="Name" value={me.Name} required />
                    <AntForm.Item label="Department">
                        <input type="hidden" name="departmentId" value={departmentId} />
                        <Select
                            value={departmentId}
                            onChange={setDepartmentId}
                            style={{ width: '100%' }}>
                            <Select.Option value="">No department</Select.Option>
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
                        value={me.Phone}
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                    />
                    <TextField
                        name="whatsapp"
                        label="WhatsApp"
                        type="tel"
                        value={me.Whatsapp}
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                    />
                    <div>
                        <SaveFooter
                            label={registration ? 'Get started' : 'Save'}
                            busy={save.busy}
                            errorMessage={save.errorMessage}
                        />
                    </div>
                </form>
            </Card>
        </Page>
    );
}

// Edit-only: users self-register on first sign-in (see the
// on_auth_user_created trigger) rather than being pre-provisioned by an
// admin, so there is no "Add user" flow.
function Detail({ kind, dashboard }: Props & { kind: 'inventory' | 'programs' }) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get(kind === 'inventory' ? 'inventoryRequest' : 'programRequest');
    const resource = kind === 'inventory' ? 'inventory-requests' : 'program-requests';
    // Fetches this one record through the resource's own getOne operation
    // rather than finding it in dashboard.inventoryRequests/programRequests —
    // that array is truncated to the most recently active requests, so an
    // older one wouldn't be found there even though it still exists.
    const { result: row, query } = useOne<InventoryRequestDTO | ProgramRequestDTO>({
        resource,
        id: id || '',
        queryOptions: { enabled: Boolean(id) },
        // A missing/deleted record is a normal "not found" navigation state
        // here, not something to alert the user about with a toast.
        errorNotification: false,
    });
    const back = kind === 'inventory' ? navigateToInventoryRequests : navigateToPrograms;
    if (id && query.isLoading) {
        return (
            <Page title="Loading request…">
                <Typography.Text>Loading request…</Typography.Text>
            </Page>
        );
    }
    if (!row) {
        return params.get('mode') === 'create' ? (
            <CreateRecord kind={kind} dashboard={dashboard} onClose={back} />
        ) : (
            <Page title="Not found">
                <Card title="Record not found">
                    <Button onClick={back}>Back</Button>
                </Card>
            </Page>
        );
    }
    if (kind === 'inventory')
        return (
            <InventoryDetail
                key={row.Id}
                request={row as InventoryRequestDTO}
                dashboard={dashboard}
            />
        );
    return <ProgramDetail key={row.Id} request={row as ProgramRequestDTO} dashboard={dashboard} />;
}

export function renderRefineApp(
    section: string,
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    const params = new URLSearchParams(window.location.search);
    let page: ReactNode;
    if (section === 'home') page = <Home dashboard={dashboard} />;
    else if (section === 'profile') page = <Profile dashboard={dashboard} />;
    else if (section === 'users') page = <Users dashboard={dashboard} />;
    else if (section === 'roster') page = <Roster dashboard={dashboard} />;
    else if (section === 'calendar') page = <Calendar dashboard={dashboard} />;
    else if (['inventory', 'programs'].includes(section)) {
        const detail =
            Boolean(params.get(section === 'inventory' ? 'inventoryRequest' : 'programRequest')) ||
            params.get('mode') === 'create';
        page = detail ? (
            <Detail
                key={section}
                kind={section as 'inventory' | 'programs'}
                dashboard={dashboard}
            />
        ) : (
            <RequestTable
                key={section}
                kind={section as 'inventory' | 'programs'}
                dashboard={dashboard}
            />
        );
    } else page = <Home dashboard={dashboard} />;
    mountRefinePage(container, page, section);
}

export function renderRefineRegistration(
    container: HTMLElement,
    dashboard: DashboardPayload,
): void {
    mountRefinePage(container, <Profile dashboard={dashboard} registration />, 'registration');
}
