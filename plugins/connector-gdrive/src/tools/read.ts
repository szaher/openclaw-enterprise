import type { ConnectorReadResult } from '@openclaw-enterprise/shared';
import { ConnectorBase } from '@openclaw-enterprise/shared';
import type { GatewayMethods } from '@openclaw-enterprise/shared';

// --- Google Drive API response types ---

export interface GDriveFileResponse {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  modifiedTime: string;
  exportedContent: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
  lastModifyingUser?: { displayName: string; emailAddress: string };
  size?: string;
}

export interface GDriveSearchResponse {
  files: GDriveFileResponse[];
  nextPageToken?: string;
}

// --- Google Drive API client interface ---

export interface GDriveApiClient {
  getFile(fileId: string, exportMimeType?: string): Promise<GDriveFileResponse>;
  searchFiles(query: string, pageSize?: number): Promise<GDriveSearchResponse>;
}

/**
 * GDrive connector providing read and search tools.
 * Extends ConnectorBase for automatic policy evaluation, audit logging,
 * classification propagation, and OAuth revocation detection.
 *
 * Raw document content is discarded after structured extraction --
 * only title, summary, classification, and metadata are retained.
 */
export class GDriveReadConnector extends ConnectorBase {
  private readonly apiClient: GDriveApiClient;

  constructor(
    gateway: GatewayMethods,
    tenantId: string,
    userId: string,
    apiClient: GDriveApiClient,
  ) {
    super('gdrive', gateway, tenantId, userId);
    this.apiClient = apiClient;
  }

  /**
   * gdrive_read: Fetch a single document by ID.
   * Returns structured ConnectorReadResult with title, summary, and classification.
   * Raw document content is discarded after extraction.
   */
  async read(params: { fileId: string }): Promise<ConnectorReadResult> {
    return this.executeRead(
      'gdrive_read',
      params,
      // fetchRaw: call the Drive API
      async () => this.apiClient.getFile(params.fileId, 'text/plain'),
      // extract: convert raw API response to structured result, discard raw content
      (raw: GDriveFileResponse) => this.extractSingleFile(raw),
    );
  }

  /**
   * gdrive_search: Search documents by query string.
   * Returns list of matching documents as ConnectorReadResult items.
   * Raw document content is discarded after extraction.
   */
  async search(params: { query: string; maxResults?: number }): Promise<ConnectorReadResult> {
    const pageSize = params.maxResults ?? 10;

    return this.executeRead(
      'gdrive_search',
      params,
      // fetchRaw: call the Drive API search
      async () => this.apiClient.searchFiles(params.query, pageSize),
      // extract: convert raw API response to structured result, discard raw content
      (raw: GDriveSearchResponse) => this.extractSearchResults(raw),
    );
  }

  /**
   * Extract structured data from a single file API response.
   * The raw exportedContent is used only to generate a summary, then discarded.
   */
  private extractSingleFile(raw: GDriveFileResponse): ConnectorReadResult {
    const summary = this.generateSummary(raw.exportedContent, raw.name);

    return {
      items: [
        {
          id: raw.id,
          source: 'gdrive',
          sourceId: raw.id,
          title: raw.name,
          summary,
          classification: 'internal', // default; will be reclassified by policy.classify
          url: raw.webViewLink,
          metadata: {
            mimeType: raw.mimeType,
            lastModifiedBy: raw.lastModifyingUser?.displayName ?? null,
            owners: raw.owners?.map((o) => o.emailAddress) ?? [],
            size: raw.size ?? null,
          },
          timestamp: raw.modifiedTime,
        },
      ],
      connectorStatus: 'ok',
    };
  }

  /**
   * Extract structured data from a search API response.
   * Each file's exportedContent is used only to generate a summary, then discarded.
   */
  private extractSearchResults(raw: GDriveSearchResponse): ConnectorReadResult {
    const items = raw.files.map((file) => ({
      id: file.id,
      source: 'gdrive' as const,
      sourceId: file.id,
      title: file.name,
      summary: this.generateSummary(file.exportedContent, file.name),
      classification: 'internal' as const, // default; will be reclassified by policy.classify
      url: file.webViewLink,
      metadata: {
        mimeType: file.mimeType,
        lastModifiedBy: file.lastModifyingUser?.displayName ?? null,
        owners: file.owners?.map((o) => o.emailAddress) ?? [],
        size: file.size ?? null,
      },
      timestamp: file.modifiedTime,
    }));

    return {
      items,
      connectorStatus: 'ok',
    };
  }

  /**
   * Generate a brief summary from document content.
   * Truncates to first 500 characters to avoid retaining excessive raw text.
   */
  private generateSummary(content: string, title: string): string {
    if (!content || content.trim().length === 0) {
      return `Document: ${title} (no extractable text content)`;
    }

    const cleaned = content.replace(/\s+/g, ' ').trim();
    const maxLength = 500;

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    return `${cleaned.slice(0, maxLength)}...`;
  }
}
