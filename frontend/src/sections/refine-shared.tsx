import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { FieldValues, UseFormRegisterReturn, UseFormReturn } from 'react-hook-form';
import {
    Button,
    Card as AntCard,
    Empty as AntEmpty,
    Form as AntForm,
    Input,
    Modal as AntModal,
    Typography,
} from 'antd';
import { useDashboard } from '../dashboard-context';
import { showErrorAlert } from '../ui/feedback';

export function Page({
    title,
    headingContent,
    action,
    className,
    hideHeading = false,
    children,
}: {
    title: string;
    headingContent?: ReactNode;
    action?: ReactNode;
    className?: string;
    hideHeading?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={`antd-page${className ? ` ${className}` : ''}`}>
            {!hideHeading && (
                <div className="antd-page-heading">
                    <div>
                        <Typography.Title level={2}>{title}</Typography.Title>
                    </div>
                    {headingContent}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
export function Card({
    title,
    action,
    className,
    children,
}: {
    title: ReactNode;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <AntCard title={title} extra={action} className={className}>
            {children}
        </AntCard>
    );
}
export function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
    return <AntEmpty description={children} />;
}
export function Submit({ label = 'Save', busy }: { label?: string; busy?: boolean }) {
    return (
        <Button type="primary" htmlType="submit" loading={busy}>
            {label}
        </Button>
    );
}

export function SaveFooter({
    label,
    busy,
    errorMessage,
}: {
    label: string;
    busy?: boolean;
    errorMessage?: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Submit label={label} busy={busy} />
            {errorMessage && (
                <Typography.Text type="danger" className="text-sm">
                    {errorMessage}
                </Typography.Text>
            )}
        </div>
    );
}
export function Modal({
    title,
    children,
    close,
}: {
    title: string;
    children: ReactNode;
    close: () => void;
}) {
    return (
        <AntModal open title={title} onCancel={close} footer={null} destroyOnHidden>
            {children}
        </AntModal>
    );
}
export function ActionConfirmation({
    action,
    description,
    onConfirm,
    onCancel,
}: {
    action: string;
    description?: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
}) {
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    return (
        <Modal title={`Confirm ${label}`} close={onCancel}>
            <form
                className="grid gap-3"
                onSubmit={async (event) => {
                    event.preventDefault();
                    await onConfirm();
                }}>
                <p>
                    {description ||
                        `Are you sure you want to ${action.toLowerCase()} this request?`}
                </p>
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>No</Button>
                    <Button type="primary" htmlType="submit">
                        Yes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
export function useSave<T>(
    action: () => Promise<T>,
    close?: () => void,
    optimistic = false,
    refreshAfterSave = true,
) {
    const { refreshDashboard } = useDashboard();
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    return {
        busy,
        errorMessage,
        run: async (event?: FormEvent) => {
            event?.preventDefault();
            if (event) {
                const form = event.currentTarget as HTMLFormElement;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return false;
                }
            }
            setErrorMessage('');
            setBusy(true);
            if (optimistic) {
                close?.();
                setBusy(false);
                void action().catch((e) => showErrorAlert(e));
                return null;
            }
            try {
                const result = await action();
                close?.();
                if (refreshAfterSave) await refreshDashboard();
                return result;
            } catch (e) {
                setErrorMessage(e instanceof Error ? e.message : String(e));
                return null;
            } finally {
                setBusy(false);
            }
        },
    };
}

export function useRHFSave<T extends FieldValues>(
    form: UseFormReturn<T>,
    action: (values: T) => Promise<void>,
    refreshAfterSave = true,
) {
    const { refreshDashboard } = useDashboard();
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const onSubmit = form.handleSubmit(async (values) => {
        setErrorMessage('');
        setBusy(true);
        try {
            await action(values);
            if (refreshAfterSave) await refreshDashboard();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    });
    return { busy, errorMessage, onSubmit };
}

export function TextField({
    name,
    label,
    value,
    type = 'text',
    required = false,
    pattern,
    title,
    onChange,
    registration,
    error,
}: {
    name: string;
    label: string;
    value?: string | number;
    type?: string;
    required?: boolean;
    pattern?: string;
    title?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    registration?: UseFormRegisterReturn;
    error?: string;
}) {
    const [inputError, setInputError] = useState('');
    const displayedError = error || inputError;
    return (
        <AntForm.Item
            label={label}
            required={required}
            className="antd-form-item"
            validateStatus={displayedError ? 'error' : undefined}
            help={displayedError}>
            <Input
                {...registration}
                name={name}
                type={type}
                value={onChange ? (value ?? '') : undefined}
                defaultValue={onChange ? undefined : (value ?? '')}
                required={required}
                pattern={pattern}
                title={title}
                onInvalid={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget;
                    setInputError(
                        input.validity.valueMissing
                            ? `${label} is required.`
                            : input.validity.typeMismatch
                              ? `Enter a valid ${label.toLowerCase()}.`
                              : title ||
                                input.validationMessage ||
                                `Enter a valid ${label.toLowerCase()}.`,
                    );
                }}
                onChange={(event) => {
                    setInputError('');
                    void registration?.onChange(event);
                    onChange?.(event);
                }}
            />
        </AntForm.Item>
    );
}
