const DASHBOARD_REQUEST_LIMIT = 250;

// The single "load everything the home screen needs" call, mirroring the
// source app's GET /api/v1/dashboard. DTO-building helpers referenced here
// (buildRosterDTO, buildInventoryTypeDTOs, buildInventoryRequestDTO,
// buildProgramRequestDTO, buildTicketDTO) live in
// Roster.ts/Inventory.ts/Programs.ts/Tickets.ts respectively — safe to
// reference across files since Apps Script loads every file's function
// declarations before any entry point runs.
function getDashboard(): DashboardPayload {
    const actor = requireUser();

    const departments = Tables.Departments.readAll();
    const departmentsById = indexBy(departments, (d) => d.Id);
    const places = Tables.Places.readAll();
    const inventoryTypes = buildInventoryTypeDTOs(Tables.InventoryTypes.readAll());
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);

    // The roster is admin/approver-only (see listRosters in Roster.ts), so
    // everyone else gets an empty list and the roster page drops its shift cards.
    const todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const upcomingRosters = canApprove(actor)
        ? Tables.Rosters.findWhere((r) => r.EndDate >= todayIso)
              .sort((a, b) => (a.StartDate + a.StartTime).localeCompare(b.StartDate + b.StartTime))
              .map((roster) => buildRosterDTO(roster, usersByEmail))
        : [];

    const visibleInventoryRows = Tables.InventoryRequests.readAll().filter((r) =>
        canViewRequest(actor, r.UserId, parseParticipants(r.Participants)),
    );
    const visibleProgramRows = Tables.ProgramRequests.readAll().filter((r) =>
        canViewRequest(actor, r.UserId, parseParticipants(r.Participants)),
    );
    const visibleTicketRows = canUseTickets(actor) ? Tables.Tickets.readAll() : [];

    // Both request lists are scoped to what the actor may see — a `user`
    // gets only their own and the ones they're a participant on (see
    // canViewRequest in Auth.ts). listInventoryRequests/listProgramRequests
    // apply the same filter for their paged views.
    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    const inventoryRequests = visibleInventoryRows
        .filter((r) => ['closed', 'rejected', 'cancelled'].indexOf(r.Status) === -1)
        .map((request) =>
            buildInventoryRequestDTO(request, inventoryTypesById, usersByEmail, departmentsById),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        )
        .slice(0, DASHBOARD_REQUEST_LIMIT);

    const placesById = indexBy(places, (p) => p.Id);
    const programRequests = visibleProgramRows
        .map((request) =>
            buildProgramRequestDTO(request, placesById, usersByEmail, departmentsById),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        )
        .slice(0, DASHBOARD_REQUEST_LIMIT);

    // The whole ticket board is invisible to `user` (canUseTickets), so the
    // payload carries nothing for them to render a section from.
    const tickets = canUseTickets(actor)
        ? visibleTicketRows
              .sort((a, b) => b.DisplayId - a.DisplayId)
              .slice(0, DASHBOARD_REQUEST_LIMIT)
              .map((ticket) => buildTicketDTO(ticket, usersByEmail))
        : [];

    const settings = getSettings();
    const homeContent: HomeContent = { Guidelines: settings.guidelines };
    const blocks = canApprove(actor)
        ? Tables.Blocks.readAll().sort((a, b) => a.StartDateTime.localeCompare(b.StartDateTime))
        : [];

    // Admins and approvers can monitor failed notifications; other roles skip
    // the read entirely rather than receiving a count they cannot act on.
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const failedEmailCount = canApprove(actor)
        ? Tables.FailedEmails.findWhere((f) => f.Timestamp >= sevenDaysAgoIso).length
        : 0;

    return {
        me: toUserDTO(actor),
        users: canApprove(actor) ? Tables.Users.readAll().map(toUserDTO) : [],
        departments,
        places,
        inventoryTypes,
        upcomingRosters,
        inventoryRequests,
        programRequests,
        tickets,
        homeContent,
        shiftTypes: settings.shiftTypes,
        programTypes: settings.programTypes,
        programLanguages: settings.programLanguages,
        sessionTypes: settings.sessionTypes,
        blocks,
        failedEmailCount,
    };
}
