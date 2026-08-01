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
    const places = Tables.Places.readAll();
    const inventoryTypes = buildInventoryTypeDTOs(Tables.InventoryTypes.readAll());
    const usersByEmail = indexBy(Tables.Users.readAll(), (u) => u.Email);

    const todayIso = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    const horizonIso = Utilities.formatDate(
        new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        'Asia/Kolkata',
        'yyyy-MM-dd',
    );
    const upcomingRosters = Tables.Rosters.findWhere(
        (r) => r.StartDate >= todayIso && r.StartDate <= horizonIso,
    )
        .sort((a, b) => (a.StartDate + a.StartTime).localeCompare(b.StartDate + b.StartTime))
        .slice(0, 250)
        .map((roster) => buildRosterDTO(roster, usersByEmail));

    const commentsByRequestId = groupCommentsByRequestId(Tables.Comments.readAll());

    const itemsByRequest = groupBy(Tables.InventoryItems.readAll(), (i) => i.RequestId);
    const inventoryTypesById = indexBy(Tables.InventoryTypes.readAll(), (t) => t.Id);
    const inventoryRequests = Tables.InventoryRequests.readAll()
        .map((request) =>
            buildInventoryRequestDTO(
                request,
                itemsByRequest,
                inventoryTypesById,
                usersByEmail,
                commentsByRequestId,
            ),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        )
        .slice(0, 250);

    const sessionsByRequest = groupBy(Tables.Sessions.readAll(), (s) => s.RequestId);
    const placesById = indexBy(places, (p) => p.Id);
    const programRequests = Tables.ProgramRequests.readAll()
        .map((request) =>
            buildProgramRequestDTO(
                request,
                sessionsByRequest,
                placesById,
                usersByEmail,
                commentsByRequestId,
            ),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        )
        .slice(0, 250);

    const tickets = Tables.Tickets.readAll()
        .sort((a, b) => b.DisplayId - a.DisplayId)
        .slice(0, 250)
        .map((ticket) => buildTicketDTO(ticket, usersByEmail));

    const links = readLinks()
        .filter((l) => toBool(l.Enabled))
        .sort((a, b) => a.Name.localeCompare(b.Name));

    const homeContent = readHomeContent();

    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const failedEmailCount = Tables.FailedEmails.findWhere(
        (f) => f.Timestamp >= sevenDaysAgoIso,
    ).length;

    return {
        me: toUserDTO(actor),
        departments,
        places,
        inventoryTypes,
        upcomingRosters,
        inventoryRequests,
        programRequests,
        tickets,
        links,
        homeContent,
        failedEmailCount,
    };
}
