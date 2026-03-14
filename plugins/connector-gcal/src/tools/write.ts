import { ConnectorBase, type GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorWriteResult, DataClassificationLevel } from '@openclaw-enterprise/shared/types.js';

/**
 * GCal write tools — calendar_create and calendar_modify.
 * Extends ConnectorBase for policy evaluation, audit logging, and classification.
 */
export class GCalWriteTools extends ConnectorBase {
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
   * calendar_create — Create a new calendar event.
   */
  async calendarCreate(params: {
    summary: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
    attendees?: string[];
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';

    return this.executeWrite(
      'calendar_create',
      {
        summary: params.summary,
        start: params.start,
        end: params.end,
        location: params.location,
        attendeeCount: params.attendees?.length ?? 0,
      },
      async () => {
        const eventBody: Record<string, unknown> = {
          summary: params.summary,
          start: { dateTime: params.start },
          end: { dateTime: params.end },
        };

        if (params.description) eventBody.description = params.description;
        if (params.location) eventBody.location = params.location;
        if (params.attendees) {
          eventBody.attendees = params.attendees.map((email) => ({ email }));
        }

        const url = `${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventBody),
        });

        if (!response.ok) {
          throw new Error(`GCal API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { id: string };
        return { sourceId: data.id };
      },
      classification,
    );
  }

  /**
   * calendar_modify — Modify an existing calendar event.
   */
  async calendarModify(params: {
    eventId: string;
    summary?: string;
    start?: string;
    end?: string;
    description?: string;
    location?: string;
    attendees?: string[];
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';

    return this.executeWrite(
      'calendar_modify',
      {
        eventId: params.eventId,
        summary: params.summary,
        start: params.start,
        end: params.end,
      },
      async () => {
        const patchBody: Record<string, unknown> = {};
        if (params.summary !== undefined) patchBody.summary = params.summary;
        if (params.start !== undefined) patchBody.start = { dateTime: params.start };
        if (params.end !== undefined) patchBody.end = { dateTime: params.end };
        if (params.description !== undefined) patchBody.description = params.description;
        if (params.location !== undefined) patchBody.location = params.location;
        if (params.attendees !== undefined) {
          patchBody.attendees = params.attendees.map((email) => ({ email }));
        }

        const url = `${this.baseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(params.eventId)}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchBody),
        });

        if (!response.ok) {
          throw new Error(`GCal API error: ${response.status} ${response.statusText}`);
        }

        return { sourceId: params.eventId };
      },
      classification,
    );
  }
}
