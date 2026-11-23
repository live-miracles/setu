import { Button } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { requestActionTone } from '../ui/request-status';

const ACTION_DESCRIPTIONS: Record<string, string> = {
    revise: 'Return this rejected request to draft? Its details and activity will be kept. You must submit it again for approval after making changes.',
    unapprove:
        'Withdraw the approval and return this request to submitted? It will need to be approved or rejected again.',
    reopen: 'Reopen this cancelled request as a draft? Its details and activity will be kept. It must be submitted again for approval.',
};

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
                        ACTION_DESCRIPTIONS[action] ||
                        `Are you sure you want to ${action.toLowerCase()} this request?`}
                </p>
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>No</Button>
                    <Button type="primary" tone={requestActionTone(action)} htmlType="submit">
                        Yes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
