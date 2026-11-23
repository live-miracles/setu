import { useState, type FormEvent } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { showErrorAlert } from '../ui/feedback';

export function useSave<T>(action: () => Promise<T>, close?: () => void, optimistic = false) {
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    return {
        busy,
        errorMessage,
        clearError: () => setErrorMessage(''),
        run: async (event?: FormEvent) => {
            event?.preventDefault();
            setErrorMessage('');
            if (event) {
                const form = event.currentTarget as HTMLFormElement;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return false;
                }
            }
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
) {
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const onSubmit = (event?: FormEvent) => {
        setErrorMessage('');
        return form.handleSubmit(async (values) => {
            setBusy(true);
            try {
                await action(values);
            } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : String(error));
            } finally {
                setBusy(false);
            }
        })(event);
    };
    return { busy, errorMessage, onSubmit };
}
