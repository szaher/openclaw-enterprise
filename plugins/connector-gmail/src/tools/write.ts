import { ConnectorBase, type GatewayMethods } from '@openclaw-enterprise/shared/connector-base.js';
import type { ConnectorWriteResult, DataClassificationLevel } from '@openclaw-enterprise/shared/types.js';
import { AI_DISCLOSURE_LABEL } from '@openclaw-enterprise/shared/constants.js';

/**
 * Gmail write tools — email_draft and email_send.
 * Extends ConnectorBase for policy evaluation, audit logging, and classification.
 * All sent emails include the AI disclosure label per FR-018.
 */
export class GmailWriteTools extends ConnectorBase {
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
   * email_draft — Create a draft email.
   * Draft is saved but not sent. AI disclosure label is included.
   */
  async emailDraft(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';
    const bodyWithDisclosure = this.appendAiDisclosure(params.body);

    return this.executeWrite(
      'email_draft',
      { to: params.to, subject: params.subject, cc: params.cc, bcc: params.bcc },
      async () => {
        const raw = this.buildRawEmail({
          to: params.to,
          subject: params.subject,
          body: bodyWithDisclosure,
          cc: params.cc,
          bcc: params.bcc,
        });

        const response = await fetch(`${this.baseUrl}/drafts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { raw },
          }),
        });

        if (!response.ok) {
          throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { id: string; message: { id: string } };
        return { sourceId: data.id };
      },
      classification,
    );
  }

  /**
   * email_send — Send an email.
   * AI disclosure label is appended to the body per FR-018.
   */
  async emailSend(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    classification?: DataClassificationLevel;
  }): Promise<ConnectorWriteResult> {
    const classification = params.classification ?? 'internal';
    const bodyWithDisclosure = this.appendAiDisclosure(params.body);

    return this.executeWrite(
      'email_send',
      { to: params.to, subject: params.subject, cc: params.cc, bcc: params.bcc },
      async () => {
        const raw = this.buildRawEmail({
          to: params.to,
          subject: params.subject,
          body: bodyWithDisclosure,
          cc: params.cc,
          bcc: params.bcc,
        });

        const response = await fetch(`${this.baseUrl}/messages/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });

        if (!response.ok) {
          throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { id: string; threadId: string };
        return { sourceId: data.id };
      },
      classification,
    );
  }

  /**
   * Append AI disclosure label to email body per FR-018.
   */
  private appendAiDisclosure(body: string): string {
    return `${body}\n\n---\n${AI_DISCLOSURE_LABEL}`;
  }

  /**
   * Build a base64url-encoded RFC 2822 email message.
   */
  private buildRawEmail(params: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
  }): string {
    const lines: string[] = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'Content-Type: text/plain; charset=utf-8',
    ];

    if (params.cc) lines.push(`Cc: ${params.cc}`);
    if (params.bcc) lines.push(`Bcc: ${params.bcc}`);

    lines.push('', params.body);

    const message = lines.join('\r\n');
    // Base64url encode
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
