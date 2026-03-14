import { ConnectorBase, type GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';

/**
 * Raw Gmail API message shape (ephemeral — discarded after extraction).
 */
interface GmailRawMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body: { data?: string; size: number };
    parts?: Array<{ mimeType: string; body: { data?: string; size: number } }>;
  };
  internalDate: string;
}

interface GmailListResponse {
  messages: GmailRawMessage[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export class GmailReadTools extends ConnectorBase {
  private readonly accessToken: string;
  private readonly baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';

  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    accessToken: string,
  ) {
    super('gmail', gateway, tenantId, userId);
    this.accessToken = accessToken;
  }

  /**
   * email_read — fetch a specific email by ID.
   * Raw body is discarded after structured extraction.
   */
  async emailRead(params: { messageId: string }): Promise<ConnectorReadResult> {
    return this.executeRead<GmailRawMessage>(
      'email_read',
      params,
      () => this.fetchMessage(params.messageId),
      (raw) => this.extractMessage(raw),
    );
  }

  /**
   * email_search — search emails with a Gmail query string.
   * Raw bodies are discarded after structured extraction.
   */
  async emailSearch(params: { query: string; maxResults?: number }): Promise<ConnectorReadResult> {
    const maxResults = params.maxResults ?? 10;
    return this.executeRead<GmailRawMessage[]>(
      'email_search',
      params,
      () => this.searchMessages(params.query, maxResults),
      (rawMessages) => this.extractMessages(rawMessages),
    );
  }

  // --- Private: Gmail API calls ---

  private async fetchMessage(messageId: string): Promise<GmailRawMessage> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<GmailRawMessage>;
  }

  private async searchMessages(query: string, maxResults: number): Promise<GmailRawMessage[]> {
    const searchUrl = `${this.baseUrl}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const listResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!listResponse.ok) {
      throw new Error(`Gmail API error: ${listResponse.status} ${listResponse.statusText}`);
    }

    const listData = await listResponse.json() as GmailListResponse;

    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    // Fetch full message details for each result
    const messages = await Promise.all(
      listData.messages.map((msg) => this.fetchMessage(msg.id)),
    );

    return messages;
  }

  // --- Private: Extraction (raw data discarded after this) ---

  private extractMessage(raw: GmailRawMessage): ConnectorReadResult {
    return {
      items: [this.extractSingleMessage(raw)],
      connectorStatus: 'ok',
    };
  }

  private extractMessages(rawMessages: GmailRawMessage[]): ConnectorReadResult {
    if (rawMessages.length === 0) {
      return { items: [], connectorStatus: 'ok' };
    }

    return {
      items: rawMessages.map((raw) => this.extractSingleMessage(raw)),
      connectorStatus: 'ok',
    };
  }

  private extractSingleMessage(raw: GmailRawMessage): ConnectorReadResult['items'][number] {
    const headers = raw.payload.headers;
    const getHeader = (name: string): string =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const to = getHeader('To');
    const date = getHeader('Date');

    // Raw body is intentionally NOT included in the result.
    // Only structured/summary data is returned.
    return {
      id: raw.id,
      source: 'gmail',
      sourceId: raw.id,
      title: subject,
      summary: raw.snippet,
      classification: 'internal', // Default; will be reclassified by ConnectorBase
      url: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
      metadata: {
        from,
        to,
        date,
        threadId: raw.threadId,
        labelIds: raw.labelIds,
      },
      timestamp: new Date(parseInt(raw.internalDate, 10)).toISOString(),
    };
  }
}
