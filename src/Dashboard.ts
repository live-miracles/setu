// The single "load everything the home screen needs" call, mirroring the
// source app's GET /api/v1/dashboard. DTO-building helpers referenced here
// (buildRosterShiftDTO, buildEquipmentTypeDTOs, buildInventoryRequestDTO,
// buildTicketDTO) live in Roster.ts/Inventory.ts/Tickets.ts respectively —
// safe to reference across files since Apps Script loads every file's
// function declarations before any entry point runs.
function getDashboard(): DashboardPayload {
    const actor = requireUser();

    const departments = Tables.Departments.readAll();
    const locations = Tables.Locations.readAll();
    const equipmentTypes = buildEquipmentTypeDTOs(Tables.EquipmentTypes.readAll());
    const profilesById = indexById(Tables.Profiles.readAll());

    const todayIso = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    const horizonIso = Utilities.formatDate(
        new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        'Asia/Kolkata',
        'yyyy-MM-dd',
    );
    const upcomingShifts = Tables.RosterShifts.findWhere(
        (s) => s.StartDate >= todayIso && s.StartDate <= horizonIso,
    )
        .sort((a, b) => (a.StartDate + a.StartTime).localeCompare(b.StartDate + b.StartTime))
        .slice(0, 250)
        .map((shift) => buildRosterShiftDTO(shift, profilesById));

    const requestItemsByRequest = groupBy(
        Tables.InventoryRequestItems.readAll(),
        (i) => i.RequestId,
    );
    const equipmentTypesById = indexById(Tables.EquipmentTypes.readAll());
    const commentsByOwnerId = groupBy(Tables.Comments.readAll(), (c) => c.OwnerId);
    const inventoryRequests = Tables.InventoryRequests.readAll()
        .map((request) =>
            buildInventoryRequestDTO(
                request,
                requestItemsByRequest,
                equipmentTypesById,
                profilesById,
                commentsByOwnerId,
            ),
        )
        .sort((a, b) =>
            latestActivityAt(b.comments, b.DisplayId).localeCompare(
                latestActivityAt(a.comments, a.DisplayId),
            ),
        )
        .slice(0, 250);

    const locationsById = indexById(locations);
    const tickets = Tables.Tickets.readAll()
        .sort((a, b) => b.DisplayId - a.DisplayId)
        .slice(0, 250)
        .map((ticket) => buildTicketDTO(ticket, profilesById, locationsById));

    const links = Tables.Links.findWhere((l) => toBool(l.Enabled)).sort((a, b) =>
        a.Name.localeCompare(b.Name),
    );

    const homeContent = readHomeContent();

    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const failedNotificationCount = Tables.FailedNotifications.findWhere(
        (f) => f.Timestamp >= sevenDaysAgoIso,
    ).length;

    return {
        me: toProfileDTO(actor),
        departments,
        locations,
        equipmentTypes,
        upcomingShifts,
        inventoryRequests,
        tickets,
        links,
        homeContent,
        failedNotificationCount,
    };
}
