import type { AuthProvider } from 'react-admin';
import { appsScriptClient } from './apps-script-client';

export const authProvider: AuthProvider = {
    login: async () => undefined,
    logout: async () => undefined,
    checkAuth: async () => {
        await appsScriptClient.whoAmI();
    },
    checkError: async (error) => {
        if (error?.status === 401 || error?.status === 403) throw error;
    },
    getIdentity: async () => {
        const user = await appsScriptClient.whoAmI();
        return { id: user.Email, fullName: user.Name, avatar: undefined };
    },
    getPermissions: async () => {
        const user = await appsScriptClient.whoAmI();
        return user.Role;
    },
};
