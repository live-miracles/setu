import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { canApprove } from '../workflows';
import { useList } from './resources';

// Reference data: the current user, the home content and the small lists that
// pickers, labels and role checks read (departments, places, inventory types,
// shift types ...). Each is fetched once and cached under one query key, so a
// screen asks for what it needs with a hook instead of receiving it as a prop.
//
// It never goes stale by itself (`staleTime: Infinity`): it is refetched when a
// save invalidates it (see DEPENDENT_QUERIES in resources.ts), on a Refresh, or
// on reload. Without that, every screen that mounts would fetch it again.

const REFERENCE = { staleTime: Infinity } as const;

// A stable empty list, so a hook that has no data yet doesn't hand its caller a
// new array on every render.
const NONE: never[] = [];

function useReferenceList<T>(resource: string, enabled = true): T[] {
    const { query } = useList<T>({ resource, queryOptions: { enabled, ...REFERENCE } });
    return query.data?.data ?? (NONE as T[]);
}

// The signed-in person. The app waits for it before it draws anything (app.tsx),
// so everything inside the routes can call useMe(), which is never undefined.
export function useMeQuery() {
    return useQuery({ queryKey: ['me'], queryFn: () => api.whoAmI(), ...REFERENCE });
}

export function useMe(): UserDTO {
    const me = useMeQuery().data;
    if (!me) throw new Error('useMe() was called before the current user was loaded.');
    return me;
}

// Which views an admin hid, and the guidelines text. Like the current user, it
// is loaded before the app draws, so useHomeContent() is never undefined there.
export function useHomeContentQuery() {
    return useQuery({
        queryKey: ['home-content'],
        queryFn: () => api.getHomeContent(),
        ...REFERENCE,
    });
}

export function useHomeContent(): HomeContent {
    const content = useHomeContentQuery().data;
    if (!content) throw new Error('useHomeContent() was called before the home content loaded.');
    return content;
}

export const useDepartments = () => useReferenceList<Department>('departments');
export const usePlaces = () => useReferenceList<Place>('places');
export const useBlocks = () => useReferenceList<Block>('blocks');
export const useInventoryTypes = () => useReferenceList<InventoryTypeDTO>('inventory-types');
export const useShiftTypes = () => useReferenceList<ShiftType>('shift-types');
export const useProgramTypes = () => useReferenceList<ProgramType>('program-types');
export const useProgramLanguages = () => useReferenceList<ProgramLanguage>('program-languages');
export const useSessionTypes = () => useReferenceList<SessionType>('session-types');

// Everyone's profile, for the pickers and the department and user screens. Only
// an approver gets more than their own profile, so for anyone else it stays
// idle rather than fetching a list of one.
export function useUsers(): UserDTO[] {
    const me = useMeQuery().data;
    return useReferenceList<UserDTO>('users', me ? canApprove(me) : false);
}
