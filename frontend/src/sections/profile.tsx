import { Select, Field } from '../ui/form-kit';
import { Card, Space, Tag, Typography } from '../ui/kit';
import { Controller, useForm } from 'react-hook-form';
import { api } from '../api';
import { useInvalidate } from '../ui/resources';
import { useDepartments, useMe } from '../ui/reference';
import { roleLabel } from '../ui/styles';
import {
    internationalPhoneRules,
    isValidInternationalPhone,
    INTERNATIONAL_PHONE_TITLE,
} from './form-utils';
import { PhoneField, SaveFooter, TextField } from './form-fields';
import { Page } from './page';
import { useRHFSave } from './save-hooks';

type ProfileFormValues = {
    name: string;
    departmentId: string;
    phone: string;
    whatsapp: string;
};

export function Profile({ registration = false }: { registration?: boolean }) {
    const me = useMe();
    const departments = useDepartments();
    const invalidate = useInvalidate();
    const form = useForm<ProfileFormValues>({
        defaultValues: {
            name: me.Name,
            departmentId: me.DepartmentId,
            phone: me.Phone,
            whatsapp: me.Whatsapp,
        },
    });
    const save = useRHFSave(form, async (values) => {
        if (!isValidInternationalPhone(values.phone)) {
            form.setError('phone', { message: INTERNATIONAL_PHONE_TITLE });
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        if (!isValidInternationalPhone(values.whatsapp)) {
            form.setError('whatsapp', { message: INTERNATIONAL_PHONE_TITLE });
            throw new Error(INTERNATIONAL_PHONE_TITLE);
        }
        await api.updateOwnProfile(values);
        // The name and department show on requests and user lists too.
        await invalidate({ resource: 'me' });
    });
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
                        value={me.Name}
                        required
                        registration={form.register('name', { required: 'Name is required' })}
                        error={form.formState.errors.name?.message}
                    />
                    <Field label="Department">
                        <Controller
                            name="departmentId"
                            control={form.control}
                            render={({ field }) => (
                                <Select {...field} className="w-full" showSearch>
                                    <Select.Option value="">No department</Select.Option>
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
