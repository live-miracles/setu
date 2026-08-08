import { Card, CardContent, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { appsScriptClient } from './apps-script-client';

export function Dashboard() {
    const [dashboard, setDashboard] = useState<DashboardPayload>();
    useEffect(() => { void appsScriptClient.getDashboard().then(setDashboard); }, []);
    if (!dashboard) return <Typography>Loading dashboard…</Typography>;
    return (
        <div>
            <Typography variant="h4" gutterBottom>Setu</Typography>
            <Typography color="text.secondary" gutterBottom>Internal operations workspace</Typography>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <Card><CardContent><Typography variant="h4">{dashboard?.inventoryRequests.length ?? 0}</Typography><Typography>Inventory requests</Typography></CardContent></Card>
                <Card><CardContent><Typography variant="h4">{dashboard?.programRequests.length ?? 0}</Typography><Typography>Program requests</Typography></CardContent></Card>
                <Card><CardContent><Typography variant="h4">{dashboard?.tickets.length ?? 0}</Typography><Typography>Tickets</Typography></CardContent></Card>
                <Card><CardContent><Typography variant="h4">{dashboard?.upcomingRosters.length ?? 0}</Typography><Typography>Upcoming shifts</Typography></CardContent></Card>
            </div>
        </div>
    );
}
