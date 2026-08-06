import { escapeHtml } from './format';

export interface DialogOption {
    value: string;
    label: string;
}

export interface DialogField {
    name: string;
    label: string;
    type?: 'text' | 'textarea' | 'select';
    value?: string;
    placeholder?: string;
    required?: boolean;
    minLength?: number;
    options?: DialogOption[];
}

interface FormDialogOptions {
    title: string;
    description?: string;
    confirmLabel: string;
    tone?: 'primary' | 'danger';
    fields?: DialogField[];
}

export function openFormDialog(options: FormDialogOptions): Promise<Record<string, string> | null> {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const fields = options.fields || [];
    dialog.innerHTML = `<div class="modal-box max-w-lg">
      <form method="dialog">
        <button class="btn btn-ghost btn-sm btn-circle absolute right-3 top-3" value="cancel" aria-label="Close dialog">✕</button>
      </form>
      <div class="ops-kicker">Confirm action</div>
      <h2 class="mt-2 font-serif text-3xl">${escapeHtml(options.title)}</h2>
      ${options.description ? `<p class="mt-3 text-sm leading-relaxed text-base-content/65">${escapeHtml(options.description)}</p>` : ''}
      <form id="setu-dialog-form" class="mt-6 space-y-4">
        ${fields
            .map((field) => {
                const required = field.required ? 'required' : '';
                const minLength = field.minLength ? `minlength="${field.minLength}"` : '';
                if (field.type === 'select') {
                    return `<fieldset class="fieldset"><label class="label" for="dialog-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><select id="dialog-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" class="select w-full" ${required}>${(field.options || []).map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></fieldset>`;
                }
                if (field.type === 'textarea') {
                    return `<fieldset class="fieldset"><label class="label" for="dialog-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><textarea id="dialog-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" class="textarea min-h-28 w-full" placeholder="${escapeHtml(field.placeholder || '')}" ${required} ${minLength}>${escapeHtml(field.value || '')}</textarea></fieldset>`;
                }
                return `<fieldset class="fieldset"><label class="label" for="dialog-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><input id="dialog-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" class="input w-full" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" ${required} ${minLength} /></fieldset>`;
            })
            .join('')}
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" data-dialog-cancel>Cancel</button>
          <button type="submit" class="btn ${options.tone === 'danger' ? 'btn-error' : 'btn-primary'}">${escapeHtml(options.confirmLabel)}</button>
        </div>
      </form>
    </div><form method="dialog" class="modal-backdrop"><button value="cancel" aria-label="Close dialog">close</button></form>`;
    document.body.appendChild(dialog);

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: Record<string, string> | null): void => {
            if (settled) return;
            settled = true;
            dialog.close();
            dialog.remove();
            window.setTimeout(() => previouslyFocused?.focus(), 0);
            resolve(value);
        };
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            finish(null);
        });
        dialog.addEventListener('close', () => finish(null));
        dialog.querySelector('[data-dialog-cancel]')!.addEventListener('click', () => finish(null));
        dialog
            .querySelector<HTMLFormElement>('#setu-dialog-form')!
            .addEventListener('submit', (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget as HTMLFormElement);
                const result: Record<string, string> = {};
                fields.forEach((field) => {
                    result[field.name] = String(data.get(field.name) || '');
                });
                finish(result);
            });
        dialog.showModal();
        const first = dialog.querySelector<HTMLElement>('textarea, select, input, [type="submit"]');
        window.setTimeout(() => first?.focus(), 0);
    });
}
