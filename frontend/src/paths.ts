// Route-path builders, used with <Link>/useNavigate() instead of a real
// server endpoint — every one of these is a client-side route matched in
// app.tsx's <Routes>.

export const homePath = '/';
export const profilePath = '/profile';
export const rosterPath = '/roster';
export const usersPath = '/users';
export const calendarPath = '/calendar';
export const inventoryPath = '/inventory';
export const inventoryCreatePath = '/inventory/new';
export const programsPath = '/programs';
export const programCreatePath = '/programs/new';
export const departmentsPath = '/departments';
export const placesPath = '/places';
export const inventoryTypesPath = '/inventory-types';
export const blocksPath = '/blocks';
export const homeContentPath = '/home-content';

export function userPath(email: string): string {
    return `/users/${encodeURIComponent(email)}`;
}

export function departmentPath(id: string): string {
    return `/departments/${encodeURIComponent(id)}`;
}

export function inventoryTypePath(id: string): string {
    return `/inventory-types/${encodeURIComponent(id)}`;
}

export function inventoryRequestPath(id: string): string {
    return `/inventory/${encodeURIComponent(id)}`;
}

export function programRequestPath(id: string): string {
    return `/programs/${encodeURIComponent(id)}`;
}
