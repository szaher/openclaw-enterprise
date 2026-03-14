import { ConnectorBase, type GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';

/**
 * Raw Google Calendar API event shape (ephemeral — discarded after extraction).
 */
interface GCalRawEvent {
  id: string;
  status: string;
  htmlLink: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
    self?: boolean;
    organizer?: boolean;
  }>;
  organizer: { email: string; displayName?: string; self?: boolean };
  creator: { email: string; displayName?: string };
  created: string;
  updated: string;
  recurringEventId?: string;
  transparency?: string;
  visibility?: string;
}

interface GCalListResponse {
  items: GCalRawEvent[];
  nextPageToken?: string;
  summary: string;
  timeZone: string;
}

/**
 * Free/busy block extracted from calendar events.
 */
interface FreeBusyBlock {
  start: string;
  end: string;
  status: 'busy' | 'tentative' | 'free';
}

export class GCalReadTools extends ConnectorBase {
  private readonly accessToken: string;
  private readonly baseUrl = 'https://www.googleapis.com/calendar/v3';
  private readonly calendarId: string;

  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    accessToken: string,
    calendarId = 'primary',
  ) {
    super('gcal', gateway, tenantId, userId);
    this.accessToken = accessToken;
    this.calendarId = calendarId;
  }

  /**
   * calendar_read — fetch calendar events within a time range.
   */
  async calendarRead(params: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<ConnectorReadResult> {
    const timeMin = params.timeMin ?? new Date().toISOString();
    const timeMax = params.timeMax ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = params.maxResults ?? 25;

    return this.executeRead<GCalRawEvent[]>(
      'calendar_read',
      { timeMin, timeMax, maxResults },
      () => this.fetchEvents(timeMin, timeMax, maxResults),
      (rawEvents) => this.extractEvents(rawEvents),
    );
  }

  /**
   * calendar_search — search events by query and extract free/busy blocks.
   */
  async calendarSearch(params: {
    query: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }): Promise<ConnectorReadResult> {
    const timeMin = params.timeMin ?? new Date().toISOString();
    const timeMax = params.timeMax ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = params.maxResults ?? 25;

    return this.executeRead<GCalRawEvent[]>(
      'calendar_search',
      { query: params.query, timeMin, timeMax, maxResults },
      () => this.searchEvents(params.query, timeMin, timeMax, maxResults),
      (rawEvents) => this.extractEventsWithFreeBusy(rawEvents),
    );
  }

  // --- Private: Google Calendar API calls ---

  private async fetchEvents(
    timeMin: string,
    timeMax: string,
    maxResults: number,
  ): Promise<GCalRawEvent[]> {
    const url = new URL(`${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`GCal API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GCalListResponse;
    return data.items ?? [];
  }

  private async searchEvents(
    query: string,
    timeMin: string,
    timeMax: string,
    maxResults: number,
  ): Promise<GCalRawEvent[]> {
    const url = new URL(`${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`);
    url.searchParams.set('q', query);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`GCal API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GCalListResponse;
    return data.items ?? [];
  }

  // --- Private: Extraction (raw data discarded after this) ---

  private extractEvents(rawEvents: GCalRawEvent[]): ConnectorReadResult {
    if (rawEvents.length === 0) {
      return { items: [], connectorStatus: 'ok' };
    }

    return {
      items: rawEvents.map((raw) => this.extractSingleEvent(raw)),
      connectorStatus: 'ok',
    };
  }

  private extractEventsWithFreeBusy(rawEvents: GCalRawEvent[]): ConnectorReadResult {
    if (rawEvents.length === 0) {
      return { items: [], connectorStatus: 'ok' };
    }

    const freeBusyBlocks: FreeBusyBlock[] = rawEvents.map((event) => ({
      start: event.start.dateTime ?? event.start.date ?? '',
      end: event.end.dateTime ?? event.end.date ?? '',
      status: event.transparency === 'transparent' ? 'free' as const : 'busy' as const,
    }));

    return {
      items: rawEvents.map((raw) => {
        const item = this.extractSingleEvent(raw);
        item.metadata = {
          ...item.metadata,
          freeBusyBlocks,
        };
        return item;
      }),
      connectorStatus: 'ok',
    };
  }

  private extractSingleEvent(raw: GCalRawEvent): ConnectorReadResult['items'][number] {
    const startTime = raw.start.dateTime ?? raw.start.date ?? '';
    const endTime = raw.end.dateTime ?? raw.end.date ?? '';

    const attendees = (raw.attendees ?? []).map((a) => ({
      email: a.email,
      displayName: a.displayName ?? a.email,
      responseStatus: a.responseStatus,
    }));

    // Raw description is NOT included — only structured metadata
    return {
      id: raw.id,
      source: 'gcal',
      sourceId: raw.id,
      title: raw.summary ?? '(No title)',
      summary: this.buildEventSummary(raw, startTime, endTime, attendees.length),
      classification: 'internal', // Default; will be reclassified by ConnectorBase
      url: raw.htmlLink,
      metadata: {
        start: startTime,
        end: endTime,
        location: raw.location ?? null,
        attendees,
        organizer: {
          email: raw.organizer.email,
          displayName: raw.organizer.displayName ?? raw.organizer.email,
        },
        status: raw.status,
        recurringEventId: raw.recurringEventId ?? null,
        visibility: raw.visibility ?? 'default',
      },
      timestamp: raw.created,
    };
  }

  private buildEventSummary(
    raw: GCalRawEvent,
    start: string,
    end: string,
    attendeeCount: number,
  ): string {
    const parts: string[] = [];
    parts.push(`${raw.summary ?? '(No title)'}`);
    parts.push(`${start} - ${end}`);
    if (raw.location) parts.push(`at ${raw.location}`);
    if (attendeeCount > 0) parts.push(`${attendeeCount} attendee(s)`);
    return parts.join(' | ');
  }
}
