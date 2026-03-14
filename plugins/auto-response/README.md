# @openclaw-enterprise/auto-response

Graduated auto-response engine for OpenClaw Enterprise. Classifies incoming messages, generates contextually appropriate responses, and routes them through a policy-controlled autonomy pipeline with per-channel, per-contact, and per-classification scope configuration.

## Architecture

```
incoming_message hook
       |
       v
  +-----------+     +----------------+     +------------------+
  | Classifier | --> | Policy Check   | --> | Scope Resolution |
  +-----------+     +----------------+     +------------------+
                                                   |
                    +------------------------------+
                    |          |          |         |
                    v          v          v         v
                autonomous  notify    approve    block
                  (send)   (send +   (queue)   (discard)
                           notify)
```

## Message Classifications

| Classification   | Description                                      |
|-----------------|--------------------------------------------------|
| `critical`      | Requires immediate human attention                |
| `needs-response`| Should receive a response, eligible for auto-send |
| `informational` | FYI message, no response needed                   |
| `noise`         | Automated/bulk notification, can be filtered      |

## Autonomy Levels

| Level        | Behavior                                          |
|-------------|--------------------------------------------------|
| `autonomous`| Response sent immediately, no user involvement     |
| `notify`    | Response sent, user notified after the fact        |
| `approve`   | Response queued for user approval before sending   |
| `block`     | No response generated or sent                      |

## Scope Configuration

Autonomy levels can be overridden per:
- **Contact**: Specific senders (highest priority)
- **Channel**: Email, Slack, etc.
- **Classification**: Per message classification type

## AI Disclosure

Every auto-generated response includes the label: "Sent by user's OpenClaw assistant" (FR-018).

## Dependencies

- `policy-engine` — Evaluates autonomy level for each response
- `audit-enterprise` — Logs all classifications, generations, and approval actions

## Gateway Methods

- `auto-response.listPending` — List pending approval queue items
- `auto-response.approve` — Approve a queued response
- `auto-response.reject` — Reject a queued response
- `auto-response.getSummary` — Get summary for briefing integration
- `auto-response.updateScopeConfig` — Update scope configuration

## HTTP Routes

- `GET /api/v1/auto-response/pending` — List pending approvals
- `POST /api/v1/auto-response/approve` — Approve a pending response
- `POST /api/v1/auto-response/reject` — Reject a pending response

## Development

```bash
pnpm --filter @openclaw-enterprise/auto-response test
pnpm --filter @openclaw-enterprise/auto-response typecheck
pnpm --filter @openclaw-enterprise/auto-response build
```
