interface AppState {
    section: string;
    dashboard: DashboardPayload | null;
}

const appState: AppState = {
    section: 'home',
    dashboard: null,
};

export function getState(): AppState {
    return appState;
}

export function setState(patch: Partial<AppState>): void {
    Object.assign(appState, patch);
}
