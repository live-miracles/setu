interface AppState {
    section: string;
    dashboard: DashboardPayload | null;
}

const appState: AppState = {
    section: 'home',
    dashboard: null,
};

function getState(): AppState {
    return appState;
}

function setState(patch: Partial<AppState>): void {
    Object.assign(appState, patch);
}
