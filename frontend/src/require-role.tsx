import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { homePath } from './paths';

// Replaces router.ts's old canOpenSection/resolveSection: every gated route
// today (roster, users, blocks, departments, places, inventory-types,
// home-content) uses the same canApprove check, so one gate covers them all.
// The backend re-checks every one of these independently (requireApprover in
// supabase/functions/api/index.ts) — this only decides what the UI offers.
export function RequireRole({
    me,
    allow,
    children,
}: {
    me: UserDTO;
    allow: (me: UserDTO) => boolean;
    children: ReactNode;
}) {
    if (!allow(me)) return <Navigate to={homePath} replace />;
    return children;
}
