import { useCustom } from '@refinedev/core';
import { Button, Empty, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { navigateToProgram, programRequestUrl } from '../router';
import { isPlainLeftClick } from '../ui/link-click';
import { formatLocalDateOnly } from '../ui/date';
import { buildCalendarTableModel } from '../ui/calendar-table';
import { Page } from './refine-shared';

type Props = { dashboard: DashboardPayload };

function blockCoversDate(block: Block, isoDate: string): boolean {
    const startDate = block.StartDateTime.slice(0, 10);
    const endDate = block.EndDateTime.slice(0, 10);
    return startDate <= isoDate && endDate >= isoDate;
}

export function Calendar({ dashboard }: Props) {
    const [month, setMonth] = useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;
    const todayIso = formatLocalDateOnly(new Date());
    const monthStartIso = formatLocalDateOnly(month);
    const monthEndIso = formatLocalDateOnly(new Date(year, monthNumber, 0));
    // Refine keys this query by (operation, args), so each month gets its own
    // cache entry automatically — paging back to a month already visited this
    // session renders instantly, with no hand-rolled cache/version bookkeeping.
    const { result, query } = useCustom<CalendarMonthPayload>({
        url: 'getCalendarMonth',
        method: 'get',
        meta: { operation: 'getCalendarMonth', args: [year, monthNumber] },
    });
    const monthData = query.isSuccess ? result.data : null;
    const loading = query.isLoading;
    const calendarPrograms = monthData?.programs || [];
    const calendarPlaces = monthData?.places || dashboard.places;
    const calendar = buildCalendarTableModel(
        calendarPrograms,
        calendarPlaces,
        dashboard.programTypes,
        todayIso,
        monthStartIso,
        monthEndIso,
        dashboard.blocks,
    );
    return (
        <Page
            title="Calendar"
            className="calendar-page"
            headingContent={
                <Space>
                    <Button
                        type="text"
                        icon={<LeftOutlined />}
                        onClick={() => setMonth(new Date(year, month.getMonth() - 1, 1))}
                        aria-label="Previous month"
                        title="Previous month"
                    />
                    <Typography.Text strong>
                        {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </Typography.Text>
                    <Button
                        type="text"
                        icon={<RightOutlined />}
                        onClick={() => setMonth(new Date(year, month.getMonth() + 1, 1))}
                        aria-label="Next month"
                        title="Next month"
                    />
                </Space>
            }>
            {/* A refresh keeps the grid up: only a month we have nothing for yet
                is worth replacing with a loading line. */}
            {loading && !monthData ? (
                <Typography.Text type="secondary">Loading calendar…</Typography.Text>
            ) : calendar.rows.length ? (
                <div className="calendar-table-scroll">
                    <table className="calendar-table">
                        <thead>
                            <tr>
                                <th scope="col" className="calendar-date-header">
                                    Date
                                </th>
                                {calendar.places.map((place) => (
                                    <th
                                        key={place.Id}
                                        scope="col"
                                        className="calendar-place-header">
                                        {place.Name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {calendar.rows.map((row) =>
                                (() => {
                                    const globalBlock = dashboard.blocks.some(
                                        (block) =>
                                            !block.Place && blockCoversDate(block, row.isoDate),
                                    );
                                    return (
                                        <tr
                                            key={row.isoDate}
                                            className={[
                                                row.isoDate === todayIso
                                                    ? 'calendar-today-row'
                                                    : '',
                                                globalBlock ? 'calendar-blocked-row' : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}>
                                            <th scope="row" className="calendar-date-cell">
                                                {row.label}
                                            </th>
                                            {row.places.map((place) => {
                                                const placeBlocked =
                                                    !globalBlock &&
                                                    dashboard.blocks.some(
                                                        (block) =>
                                                            block.Place === place.placeId &&
                                                            blockCoversDate(block, row.isoDate),
                                                    );
                                                return (
                                                    <td
                                                        key={`${row.isoDate}-${place.placeId}`}
                                                        className={`calendar-place-cell${
                                                            placeBlocked
                                                                ? ' calendar-blocked-place-cell'
                                                                : ''
                                                        }`}>
                                                        {place.blocks.map((block) => (
                                                            <a
                                                                key={block.programId}
                                                                className="calendar-program-block"
                                                                href={programRequestUrl(
                                                                    block.programId,
                                                                )}
                                                                style={{
                                                                    backgroundColor: block.color
                                                                        ? `${block.color}26`
                                                                        : undefined,
                                                                }}
                                                                onClick={(event) => {
                                                                    if (!isPlainLeftClick(event))
                                                                        return;
                                                                    event.preventDefault();
                                                                    navigateToProgram(
                                                                        block.programId,
                                                                    );
                                                                }}
                                                                aria-label={`Open ${block.title}`}>
                                                                <span className="calendar-program-title">
                                                                    {block.title}
                                                                </span>
                                                                {block.sessions.map((session) => (
                                                                    <span
                                                                        key={`${session.startDateTime}-${session.label}`}
                                                                        className="calendar-session-line">
                                                                        {session.label}
                                                                    </span>
                                                                ))}
                                                            </a>
                                                        ))}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })(),
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty>No approved programs scheduled.</Empty>
            )}
        </Page>
    );
}
