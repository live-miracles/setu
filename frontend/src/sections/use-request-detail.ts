import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDelete, useInvalidate, useUpdate } from '../ui/resources';
import { useMe } from '../ui/reference';
import { showErrorAlert, withSavingBadge } from '../ui/feedback';
import { canApprove, getRequestPermissions, type RequestPermissions } from '../workflows';
import { serializeParticipants } from '../ui/request-fields';
import { useSave } from './save-hooks';

type RequestDTO = InventoryRequestDTO | ProgramRequestDTO;
type RequestUpdate = UpdateInventoryRequestInput | UpdateProgramRequestInput;

// The wording and navigation the shared screen frame needs from a kind.
export interface RequestDetailLabels {
    listPath: string;
    listLabel: string;
    // "request" or "program": the word in the edit and delete button labels.
    noun: string;
    // What the delete confirmation calls the record, e.g. "inventory request".
    deleteSubject: string;
    // Request number prefix, e.g. "REQ".
    numberPrefix: string;
}

// What differs between an inventory request and a program request on their
// detail screens. Everything else (workflow actions, participants, delete, the
// edit form, saving) is the same and lives in useRequestDetail.
export interface RequestDetailKind<
    R extends RequestDTO,
    Values extends object,
> extends RequestDetailLabels {
    // Which Request policy applies and which resource (react-query key) holds the record.
    policy: 'inventory' | 'program';
    resource: 'inventory-requests' | 'program-requests';
    perform: (id: string, action: string) => Promise<unknown>;
    saveParticipants: (id: string, participants: string) => Promise<unknown>;
    formValues: (request: R) => Values;
    // The whole-row update for the edit form; throws a message for a missing required value.
    formUpdate: (request: R, values: Values) => RequestUpdate;
}

// The state and actions both request detail screens share. The request itself
// is the server's copy (react-query): the screen keeps no copy of its items or
// sessions, so a refetch is always what it shows. Every write goes through
// useUpdate, which makes this record, its lists and the dashboard stale.
export function useRequestDetail<R extends RequestDTO, Values extends object>(
    kind: RequestDetailKind<R, Values>,
    request: R,
) {
    const navigate = useNavigate();
    const me = useMe();
    const { mutateAsync: updateRequest } = useUpdate();
    const { mutateAsync: deleteRequest } = useDelete();
    const invalidate = useInvalidate();
    const permissions = getRequestPermissions<string>(kind.policy, request, me);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState(false);
    // The edit form's values while the editor is open, null while it is closed.
    // Opening seeds it from the request as it is now.
    const [draft, setDraft] = useState<Values | null>(null);

    // The newest copy of the request the server has given us: the loaded one, or the
    // response to our own last write, whichever came later.
    const newest = useRef(request);
    const loaded = useRef(request);
    if (loaded.current !== request) {
        loaded.current = request;
        newest.current = request;
    }
    // Writes of the request run one at a time and each is built from the newest copy,
    // so two quick changes (scanning label after label) cannot overwrite each other
    // with a list that does not have the first one yet. A build that returns null
    // has nothing to save.
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const write = (build: (latest: R) => RequestUpdate | null): Promise<void> => {
        const run = queue.current.then(async () => {
            const input = build(newest.current);
            if (!input) return;
            const { data } = await updateRequest({
                resource: kind.resource,
                id: request.Id,
                values: input,
            });
            newest.current = data as unknown as R;
        });
        queue.current = run.catch(() => undefined);
        return run;
    };

    // A write made from the page itself (a line, an image, a reschedule): shows the
    // saving badge and rethrows, so the caller reports a failure where it belongs.
    const persist = (build: (latest: R) => RequestUpdate | null) =>
        withSavingBadge(() => write(build));

    const perform = async (action: string) => {
        try {
            await withSavingBadge(async () => {
                await kind.perform(request.Id, action);
                await invalidate({ resource: kind.resource });
            });
        } catch (e) {
            showErrorAlert(e);
        }
    };

    const saveParticipants = (participants: string[]) =>
        withSavingBadge(async () => {
            await kind.saveParticipants(request.Id, serializeParticipants(participants));
            await invalidate({ resource: kind.resource });
        });

    const save = useSave(
        async () => {
            if (!draft) return;
            await write((latest) => kind.formUpdate(latest, draft));
        },
        () => setDraft(null),
    );

    return {
        kind,
        me,
        approver: canApprove(me),
        permissions,
        persist,
        write,
        saveParticipants,
        form: {
            values: draft,
            open: () => setDraft(kind.formValues(request)),
            close: () => setDraft(null),
            update: <K extends keyof Values>(key: K, value: Values[K]) =>
                setDraft((current) => (current ? { ...current, [key]: value } : current)),
            save,
        },
        workflow: {
            pending: pendingAction,
            ask: setPendingAction,
            cancel: () => setPendingAction(null),
            confirm: () => {
                const action = pendingAction;
                setPendingAction(null);
                if (action) void perform(action);
            },
        },
        remove: {
            pending: pendingDelete,
            ask: () => setPendingDelete(true),
            cancel: () => setPendingDelete(false),
            confirm: async () => {
                try {
                    await withSavingBadge(() =>
                        deleteRequest({ resource: kind.resource, id: request.Id }),
                    );
                    setPendingDelete(false);
                    navigate(kind.listPath);
                } catch (e) {
                    showErrorAlert(e);
                }
            },
        },
    };
}

// The part of useRequestDetail's result the shared frame draws.
export interface RequestDetailView {
    kind: RequestDetailLabels;
    approver: boolean;
    permissions: RequestPermissions<string>;
    saveParticipants: (participants: string[]) => Promise<void>;
    form: { open: () => void };
    workflow: {
        pending: string | null;
        ask: (action: string) => void;
        cancel: () => void;
        confirm: () => void;
    };
    remove: {
        pending: boolean;
        ask: () => void;
        cancel: () => void;
        confirm: () => Promise<void>;
    };
}
