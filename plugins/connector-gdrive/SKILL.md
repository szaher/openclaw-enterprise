# GDrive Connector Skill

## When to use

Use the GDrive tools when the user's request involves Google Drive documents:

- **gdrive_read**: Use when the user asks about a specific document and you have (or can obtain) its file ID. Examples:
  - "What does the Q3 planning doc say?" (if you know the file ID or can search first)
  - "Summarize document XYZ"
  - "What changed in the project brief?"

- **gdrive_search**: Use when the user wants to find documents matching a topic, keyword, or phrase. Examples:
  - "Find documents about the product launch"
  - "Are there any docs related to the hiring plan?"
  - "Search for meeting notes from last week"

## When NOT to use

- Do not use gdrive_read/search for emails (use gmail tools instead).
- Do not use gdrive_read/search for calendar events (use gcal tools instead).
- Do not use if the user has not connected their Google Drive account.

## Typical workflow

1. **Search first**: If the user mentions a topic but not a specific file ID, use `gdrive_search` to find relevant documents.
2. **Read specific files**: Use `gdrive_read` with the file ID from search results (or provided by the user) to get detailed content.
3. **Respect classification**: The returned data includes a classification level. Do not share `confidential` or `restricted` content outside the user's context.

## Parameters

### gdrive_read
- `fileId` (required): The Google Drive file ID.

### gdrive_search
- `query` (required): Search query string (supports Google Drive search syntax).
- `maxResults` (optional): Maximum results to return. Default: 10.

## Important notes

- All reads are policy-checked and audit-logged automatically.
- Raw document content is never persisted -- only structured summaries are returned.
- If the connector reports an OAuth error, inform the user they need to re-authenticate their Google Drive connection.
- Classification labels on returned items must be respected when deciding what to share or include in responses to other users or agents.
