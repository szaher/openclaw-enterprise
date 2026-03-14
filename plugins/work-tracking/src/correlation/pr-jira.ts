/**
 * PR-to-Jira Correlation
 *
 * Extracts Jira ticket keys from GitHub PR branch names and descriptions.
 * Supports multiple ticket references and common naming conventions.
 *
 * Ticket key pattern: PROJECT-123 (uppercase letters followed by hyphen and digits)
 */

/**
 * Result of correlating a PR to Jira tickets.
 */
export interface PrJiraCorrelation {
  /** Unique ticket keys found across all sources */
  ticketKeys: string[];
  /** Where each ticket key was found */
  sources: CorrelationSource[];
}

export interface CorrelationSource {
  ticketKey: string;
  foundIn: 'branch' | 'description' | 'title';
}

/**
 * Regex pattern for Jira ticket keys.
 * Matches PROJECT-123 format: 2+ uppercase letters, hyphen, 1+ digits.
 */
const TICKET_KEY_PATTERN = /\b([A-Z]{2,}-\d+)\b/g;

/**
 * Extract Jira ticket keys from a PR branch name.
 *
 * Supports common branch naming conventions:
 * - feature/PROJ-123-description
 * - bugfix/PROJ-456
 * - PROJ-789-some-fix
 * - fix/PROJ-123-PROJ-456 (multiple tickets)
 */
export function extractTicketKeysFromBranch(branchName: string): string[] {
  // Replace common separators with spaces to help regex
  const normalized = branchName.replace(/[/_-]/g, ' ').replace(/\//g, ' ');
  // But also match in the original to catch PROJECT-123 directly
  const keys = new Set<string>();

  for (const match of branchName.matchAll(TICKET_KEY_PATTERN)) {
    keys.add(match[1]!);
  }

  for (const match of normalized.matchAll(TICKET_KEY_PATTERN)) {
    keys.add(match[1]!);
  }

  return [...keys];
}

/**
 * Extract Jira ticket keys from PR description text.
 * Supports ticket keys appearing anywhere in the description,
 * including markdown links, lists, and inline references.
 */
export function extractTicketKeysFromDescription(description: string): string[] {
  const keys = new Set<string>();

  for (const match of description.matchAll(TICKET_KEY_PATTERN)) {
    keys.add(match[1]!);
  }

  return [...keys];
}

/**
 * Extract Jira ticket keys from PR title.
 */
export function extractTicketKeysFromTitle(title: string): string[] {
  const keys = new Set<string>();

  for (const match of title.matchAll(TICKET_KEY_PATTERN)) {
    keys.add(match[1]!);
  }

  return [...keys];
}

/**
 * Correlate a PR with Jira tickets by extracting keys from all available sources.
 * Returns a deduplicated list of ticket keys with their source locations.
 */
export function correlatePrToJira(pr: {
  branchName: string;
  title: string;
  description: string;
}): PrJiraCorrelation {
  const sources: CorrelationSource[] = [];
  const seen = new Set<string>();

  // Extract from branch name (highest confidence)
  for (const key of extractTicketKeysFromBranch(pr.branchName)) {
    sources.push({ ticketKey: key, foundIn: 'branch' });
    seen.add(key);
  }

  // Extract from title
  for (const key of extractTicketKeysFromTitle(pr.title)) {
    sources.push({ ticketKey: key, foundIn: 'title' });
    seen.add(key);
  }

  // Extract from description
  for (const key of extractTicketKeysFromDescription(pr.description)) {
    sources.push({ ticketKey: key, foundIn: 'description' });
    seen.add(key);
  }

  return {
    ticketKeys: [...seen],
    sources,
  };
}
