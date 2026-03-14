# Skill: Gmail Connector (email_read, email_search)

## When to Use

- **email_read**: Use when the user asks to read, view, or check a specific email. Requires a known Gmail message ID (typically obtained from a prior email_search or inbox poll).
- **email_search**: Use when the user asks to find, search, or look up emails. Accepts Gmail-style query syntax (e.g., `from:alice`, `subject:quarterly report`, `is:unread`, `after:2026/01/01`).

## When NOT to Use

- Do not use email_search for calendar lookups — use `calendar_search` instead.
- Do not use these tools to send or draft emails (write operations are separate).
- Do not call email_read without first confirming the message ID via search or poll.

## Behavior Notes

- All results are structured extractions (title, summary, sender, date, classification). Raw email bodies are never returned.
- Every call is policy-checked before execution. If the policy denies access, the result will contain an error with the denial reason.
- Results include a data classification level (public, internal, confidential, restricted). Higher-classified data may be redacted or withheld depending on policy.
- The inbox poller service runs in the background and discovers new emails automatically — the agent does not need to poll manually.

## Example Prompts

- "Show me my latest unread emails" -> `email_search({ query: "is:unread", maxResults: 5 })`
- "Find emails from Alice about the Q3 budget" -> `email_search({ query: "from:alice subject:Q3 budget" })`
- "Read the email with ID 18abc123" -> `email_read({ messageId: "18abc123" })`

## Output Format

Returns `ConnectorReadResult` with items containing: id, title (subject), summary (snippet), sender, date, classification, and a Gmail web URL.
