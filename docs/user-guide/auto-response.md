# Auto-Response

OpenClaw Enterprise can respond to incoming messages on your behalf with graduated levels of autonomy. Every auto-response is governed by policy, logged for audit, and clearly labeled as assistant-generated.

---

## How It Works

When a message arrives on a connected channel, the auto-response system:

1. **Classifies** the message into one of four categories.
2. **Determines the autonomy level** based on policy (channel, contact, classification).
3. **Generates a response** (if applicable).
4. **Executes the action** according to the autonomy level (send, notify, queue, or block).
5. **Logs everything** -- the original message, generated response, classification, and authorizing policy.

---

## Message Classification

Every incoming message is classified into one of four categories:

| Classification | Description | Examples |
|---|---|---|
| **Critical** | Requires immediate human attention. Time-sensitive, high-stakes. | Production incident alert, CEO direct message, security vulnerability report |
| **Needs-response** | Requires a reply but is not time-critical. | Colleague asking about project status, meeting reschedule request, code review ping |
| **Informational** | No reply expected. Contains information the user should see. | Newsletter, FYI email, automated build notification, shared document update |
| **Noise** | No reply expected. Low or no value to the user. | Marketing email, automated subscription digest, duplicate notification |

Classification uses the message content, sender identity, channel context, and historical patterns. You can correct misclassifications, and the system learns from corrections.

---

## Graduated Autonomy Levels

Each classification-channel-contact combination maps to one of four autonomy levels:

| Level | Behavior | Use Case |
|---|---|---|
| **Autonomous** | Assistant generates and sends the response without notifying you. | Acknowledging informational messages, declining obvious spam meeting invites |
| **Notify** | Assistant generates and sends the response, then tells you what it did. | Routine replies to known contacts on low-stakes topics |
| **Approve** | Assistant generates a draft response and queues it for your approval before sending. | Responses to important contacts, anything involving commitments or decisions |
| **Block** | Assistant refuses to generate any response. Message is surfaced to you directly. | Critical messages, unknown contacts, sensitive topics |

### Example Policy Mapping

| Channel | Contact | Classification | Autonomy Level |
|---|---|---|---|
| Gmail | Team members | Informational | Autonomous |
| Gmail | Team members | Needs-response | Notify |
| Gmail | External contacts | Any | Approve |
| Slack | Anyone | Critical | Block |
| Slack | Team members | Needs-response | Notify |
| Slack | Unknown | Any | Block |

> **Note:** These mappings are set by your organization's policy engine. The examples above are illustrative. Ask your administrator about your specific configuration.

---

## Scope Control

Autonomy levels can be scoped at three granularities, from broadest to narrowest:

1. **Per-classification** -- "All informational messages can be handled autonomously."
2. **Per-channel** -- "Gmail messages use approve mode; Slack messages use notify mode."
3. **Per-contact** -- "Messages from jane@company.com always use approve mode regardless of other rules."

Narrower scopes override broader ones. A per-contact rule always takes precedence over a per-channel rule.

### Configuring Scope

Scope configuration is managed through the policy engine by your administrator. As a user, you can request changes:

- *"Set auto-response for messages from the marketing team to autonomous for informational."*
- *"Block all auto-responses for messages from my manager."*
- *"Queue all external emails for my approval."*

Whether these requests are honored depends on your organization's policy hierarchy.

---

## AI Disclosure

All auto-responses include a disclosure label:

```
Sent by [your name]'s OpenClaw assistant
```

This label is:

- **Always present.** It cannot be disabled or removed.
- **Appended to every auto-generated message**, regardless of autonomy level.
- **Visible to the recipient** so they know they are interacting with an assistant.

This is a structural guarantee, not a policy setting. There is no configuration to suppress it.

---

## Approval Queue

When a message is classified at the **approve** autonomy level, the assistant:

1. Generates a draft response.
2. Places it in your approval queue.
3. Notifies you that an item is pending.

### Reviewing the Queue

Ask your assistant:

- *"Show me pending auto-responses"* -- lists all queued drafts.
- *"Show me the response queued for the email from J. Martinez"* -- shows a specific draft.

### Acting on Queued Items

For each queued item, you can:

| Action | Command Example |
|---|---|
| **Approve as-is** | *"Approve response #2"* |
| **Edit and approve** | *"Edit response #2: change the deadline to Friday, then approve"* |
| **Reject** | *"Reject response #2"* (no message is sent) |
| **Reject and reply manually** | *"Reject response #2, I'll handle this myself"* |

### Queue Expiry

Queued responses that are not acted on within 24 hours are automatically expired. The assistant will remind you of pending items in your next daily briefing.

---

## Activity Log

Every auto-response action is logged with full detail. The activity log records:

| Field | Description |
|---|---|
| Timestamp | When the action occurred |
| Original message | The incoming message that triggered the response |
| Classification | How the message was classified (critical / needs-response / informational / noise) |
| Generated response | The full text of the response that was generated (or would have been generated) |
| Autonomy level | Which level applied (autonomous / notify / approve / block) |
| Authorizing policy | The specific policy rule that authorized or blocked the action |
| Action taken | What actually happened (sent / queued / blocked) |
| Approval status | For queued items: pending / approved / rejected / expired |

### Viewing the Log

- *"Show me auto-response activity for today"*
- *"Show me all auto-responses sent autonomously this week"*
- *"Show me blocked messages from the last 24 hours"*

The activity log is also available to your administrator through the enterprise audit system.

---

## Focus Mode

Focus mode temporarily elevates autonomy levels so the assistant handles more messages without interrupting you.

### Activating Focus Mode

- *"Enable focus mode for 2 hours"*
- *"Enable focus mode until my next meeting"*
- *"Enable focus mode until I say stop"*

### What Changes During Focus Mode

| Normal Autonomy Level | Focus Mode Autonomy Level |
|---|---|
| Block | Approve (queued for later) |
| Approve | Notify |
| Notify | Autonomous |
| Autonomous | Autonomous (unchanged) |

> **Important:** Focus mode shifts are still subject to policy constraints. If your organization's policy requires that messages from certain contacts always use "block" or "approve" mode, focus mode cannot override that floor.

### Focus Mode Summary

When focus mode ends, the assistant delivers a summary of everything it handled during the focus period, including:

- Messages handled autonomously that would normally require notification or approval.
- Items queued for your review.
- Any critical messages that arrived (these always bypass focus mode).

### Example

```
Focus Mode Summary (14:00 - 16:00)
====================================
Handled autonomously (normally notify):
  - Slack #team-backend: replied to build question from A. Chen
  - Gmail: acknowledged meeting notes from L. Park

Queued for review (normally block):
  - Gmail: external vendor inquiry from sales@acme.com

Critical (bypassed focus mode):
  - Slack #incidents: production alert in payment-service
```

---

## Best Practices

1. **Start conservative.** Begin with most channels set to "approve" and loosen as you build trust in the classifications.
2. **Review the activity log regularly.** Check for misclassifications early so the system improves.
3. **Use focus mode during deep work.** It reduces interruptions while still catching critical items.
4. **Set per-contact overrides for key people.** Ensure messages from your manager, direct reports, or critical stakeholders are handled at the appropriate level.
5. **Check your approval queue before end of day.** Expired responses may leave senders without a reply.
