# Skill: Auto-Response

## Purpose

The auto-response plugin provides graduated autonomous response capabilities for incoming messages across all connected channels (email, Slack, etc.). It classifies messages, generates contextually appropriate responses, and routes them through a policy-controlled autonomy pipeline.

## When to Use

- When processing incoming messages that may benefit from automated responses
- When the user wants their assistant to handle routine communications
- When triaging messages by urgency and importance

## Capabilities

### Message Classification
Classifies incoming messages into four categories:
- **critical**: Requires immediate human attention (e.g., production outages, executive escalations)
- **needs-response**: Should receive a response, eligible for auto-response
- **informational**: FYI messages, no response needed
- **noise**: Automated notifications, bulk emails

### Graduated Autonomy
Responses are routed based on policy-controlled autonomy levels:
- **autonomous**: Response sent immediately without user involvement
- **notify**: Response sent, user notified after the fact
- **approve**: Response drafted and queued for user approval before sending
- **block**: No response generated or sent

### Scope Configuration
Autonomy levels can be configured per:
- **Channel**: Different autonomy for email vs. Slack vs. other channels
- **Contact**: Specific senders can have custom autonomy (e.g., always approve for external contacts)
- **Classification**: Different autonomy per message classification (e.g., never auto-respond to critical)

### AI Disclosure
Every auto-generated response includes the disclosure label: "Sent by user's OpenClaw assistant" per FR-018.

### Approval Queue
Responses at the "approve" autonomy level are queued for user review. Users can approve (send as-is), reject (discard), or edit before sending.

### Briefing Integration
Aggregates auto-response activity for inclusion in the daily briefing, including classification breakdowns, action summaries, and flagged critical messages.

## Dependencies

- **policy-engine**: Evaluates autonomy level for each response
- **audit-enterprise**: Logs all classifications, generations, and approval actions

## Gateway Methods

- `auto-response.listPending` — List pending approval queue items
- `auto-response.approve` — Approve a queued response
- `auto-response.reject` — Reject a queued response
- `auto-response.getSummary` — Get summary for briefing integration
- `auto-response.updateScopeConfig` — Update scope configuration from policy

## Hooks

- `incoming_message` — Processes every incoming message through the classification and response pipeline
