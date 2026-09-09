import { type ReactNode } from 'react';
import { useOne } from '@refinedev/core';
import { Button, Form as AntForm, Select, Space, Tag, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
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
import { Card, Page, SaveFooter, TextField, useRHFSave } from './refine-shared';
import { Home } from './home';
import { Calendar } from './calendar';

type Props = { dashboard: DashboardPayload };
type ProfileFormValues = {
    name: string;
    departmentId: string;
    phone: string;
    whatsapp: string;
};

function Profile({ dashboard, registration = false }: Props & { registration?: boolean }) {
    const me = dashboard.me;
    const form = useForm<ProfileFormValues>({
        defaultValues: {
            name: me.Name,
            departmentId: me.DepartmentId,
            phone: me.Phone,
            whatsapp: me.Whatsapp,
        },
    });
    const save = useRHFSave(
        form,
        async (values) => {
            if (!isValidInternationalPhone(values.phone)) {
                form.setError('phone', { message: INTERNATIONAL_PHONE_TITLE });
                throw new Error(INTERNATIONAL_PHONE_TITLE);
            }
            if (!isValidInternationalPhone(values.whatsapp)) {
                form.setError('whatsapp', { message: INTERNATIONAL_PHONE_TITLE });
                throw new Error(INTERNATIONAL_PHONE_TITLE);
            }
            await api.updateOwnProfile(values);
        },
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
                    onSubmit={save.onSubmit}>
                    <TextField
                        name="name"
                        label="Name"
                        required
                        registration={form.register('name', { required: 'Name is required' })}
                        error={form.formState.errors.name?.message}
                    />
                    <AntForm.Item label="Department">
                        <Controller
                            name="departmentId"
                            control={form.control}
                            render={({ field }) => (
                                <Select {...field} className="antd-full-width">
                                    <Select.Option value="">No department</Select.Option>
                                    {dashboard.departments.map((d) => (
                                        <Select.Option key={d.Id} value={d.Id}>
                                            {d.Name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            )}
                        />
                    </AntForm.Item>
                    <TextField
                        name="phone"
                        label="Phone"
                        type="tel"
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                        registration={form.register('phone', {
                            required: 'Phone is required',
                            pattern: {
                                value: new RegExp(INTERNATIONAL_PHONE_PATTERN),
                                message: INTERNATIONAL_PHONE_TITLE,
                            },
                        })}
                        error={form.formState.errors.phone?.message}
                    />
                    <TextField
                        name="whatsapp"
                        label="WhatsApp"
                        type="tel"
                        required
                        pattern={INTERNATIONAL_PHONE_PATTERN}
                        title={INTERNATIONAL_PHONE_TITLE}
                        registration={form.register('whatsapp', {
                            required: 'WhatsApp is required',
                            pattern: {
                                value: new RegExp(INTERNATIONAL_PHONE_PATTERN),
                                message: INTERNATIONAL_PHONE_TITLE,
                            },
                        })}
                        error={form.formState.errors.whatsapp?.message}
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
