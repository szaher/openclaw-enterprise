# Skill: Google Calendar Connector (calendar_read, calendar_search)

## When to Use

- **calendar_read**: Use when the user asks to see their calendar, upcoming events, schedule, or agenda. Fetches events within a time range (defaults to the next 7 days).
- **calendar_search**: Use when the user asks to find specific meetings, check availability, or look for events by name/topic. Returns matching events plus free/busy blocks.

## When NOT to Use

- Do not use these tools for email lookups — use `email_search` instead.
- Do not use these tools to create, update, or delete events (write operations are separate).
- Do not use calendar_read to find a specific event by name — use calendar_search with a query instead.

## Behavior Notes

- All results are structured extractions (title, start, end, attendees, location, status). Raw event descriptions are never returned.
- Every call is policy-checked before execution. If the policy denies access, the result will contain an error with the denial reason.
- Results include a data classification level. Calendar events default to `internal` but may be reclassified based on content.
- The calendar_search tool includes free/busy blocks in the metadata, which can be used for scheduling assistance.
- The sync service runs in the background to keep event data current.

## Example Prompts

- "What's on my calendar today?" -> `calendar_read({ timeMin: "2026-03-13T00:00:00Z", timeMax: "2026-03-13T23:59:59Z" })`
- "Show my schedule for next week" -> `calendar_read({ timeMin: "2026-03-16T00:00:00Z", timeMax: "2026-03-22T23:59:59Z" })`
- "Find meetings about the product launch" -> `calendar_search({ query: "product launch" })`
- "Am I free on Thursday afternoon?" -> `calendar_search({ query: "", timeMin: "2026-03-19T12:00:00Z", timeMax: "2026-03-19T18:00:00Z" })`

## Output Format

Returns `ConnectorReadResult` with items containing: id, title, summary, start/end times, attendees, location, organizer, and a Google Calendar web URL. Search results additionally include free/busy block data in metadata.
