/**
 * Google Calendar Integration Service for CelronHub
 * Supports both 1-click web intent (no authentication required) and direct API event creation
 */

import { getStoredToken } from './googleAuthService';

/**
 * Format a Date object to Google Calendar URL date string (YYYYMMDDTHHmmssZ)
 */
const formatGCalDate = (date, allDay = false) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    if (allDay) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    return d.toISOString().replace(/-|:|\.\d+/g, '');
};

/**
 * Generate official Google Calendar Web Intent URL
 * Works on all browsers and devices without needing OAuth re-approvals.
 */
export const getGoogleCalendarWebUrl = ({
    title = '',
    description = '',
    location = '',
    startDate = new Date(),
    endDate = null,
    allDay = false
}) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + (allDay ? 86400000 : 3600000));

    const startStr = formatGCalDate(start, allDay);
    const endStr = formatGCalDate(end, allDay);
    const datesParam = `${startStr}/${endStr}`;

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: datesParam,
        details: description,
        location: location
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * Open Google Calendar event creation directly in a new window/tab
 */
export const openGoogleCalendarWeb = (eventData) => {
    const url = getGoogleCalendarWebUrl(eventData);
    window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Directly create an event in the user's primary Google Calendar via API
 * Falls back to web URL if token is missing or unauthorized
 */
export const createGoogleCalendarApiEvent = async ({
    title = '',
    description = '',
    location = '',
    startDate = new Date(),
    endDate = null,
    allDay = false,
    token = null
}) => {
    const authToken = token || getStoredToken();
    if (!authToken) {
        throw new Error('NO_TOKEN');
    }

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + (allDay ? 86400000 : 3600000));

    const eventPayload = {
        summary: title,
        description: description,
        location: location,
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 1440 }, // 1 day before
                { method: 'popup', minutes: 120 }   // 2 hours before
            ]
        }
    };

    if (allDay) {
        eventPayload.start = { date: start.toISOString().split('T')[0] };
        eventPayload.end = { date: end.toISOString().split('T')[0] };
    } else {
        eventPayload.start = { dateTime: start.toISOString(), timeZone: 'Asia/Singapore' };
        eventPayload.end = { dateTime: end.toISOString(), timeZone: 'Asia/Singapore' };
    }

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Google Calendar API error (${response.status})`);
    }

    return await response.json();
};
