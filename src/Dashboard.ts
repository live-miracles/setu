// The single "load everything the home screen needs" call, mirroring the
// source app's GET /api/v1/dashboard. DTO-building helpers referenced here
// (buildRosterShiftDTO, buildInventoryItemDTO, buildInventoryRequestDTO,
// buildTicketDTO) live in Roster.ts/Inventory.ts/Tickets.ts respectively —
// safe to reference across files since Apps Script loads every file's
// function declarations before any entry point runs.
function getDashboard(): DashboardPayload {
    const actor = requireUser();

    const departments = Tables.Departments.readAll();
    const locations = Tables.Locations.readAll();
    const equipmentTypes = Tables.EquipmentTypes.readAll();
    const profilesById = indexById(Tables.Profiles.readAll());
    const locationsById = indexById(locations);
    const equipmentTypesById = indexById(equipmentTypes);

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

    const inventoryItems = Tables.InventoryItems.readAll()
        .slice(0, 500)
        .map((item) => buildInventoryItemDTO(item, equipmentTypesById, locationsById));

    const requestItemsByRequest = groupBy(
        Tables.InventoryRequestItems.readAll(),
        (i) => i.RequestId,
    );
    const inventoryItemsById = indexById(Tables.InventoryItems.readAll());
    const inventoryRequests = Tables.InventoryRequests.readAll()
        .sort((a, b) => b.UpdatedAt.localeCompare(a.UpdatedAt))
        .slice(0, 250)
        .map((request) =>
            buildInventoryRequestDTO(
                request,
                requestItemsByRequest,
                inventoryItemsById,
                profilesById,
            ),
        );

    const commentsByTicket = groupBy(Tables.TicketComments.readAll(), (c) => c.TicketId);
    const tickets = Tables.Tickets.readAll()
        .sort((a, b) => b.UpdatedAt.localeCompare(a.UpdatedAt))
        .slice(0, 250)
        .map((ticket) => buildTicketDTO(ticket, commentsByTicket, profilesById));

    const links = Tables.Links.findWhere((l) => toBool(l.Enabled)).sort(
        (a, b) => a.DisplayOrder - b.DisplayOrder,
    );

    const homeContent = Tables.HomeContent.findById('singleton')!;

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
        inventoryItems,
        inventoryRequests,
        tickets,
        links,
        homeContent,
        failedNotificationCount,
    };
}
