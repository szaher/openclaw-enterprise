# Agent-to-Agent Communication (OCIP)

The Open Claw Interchange Protocol (OCIP) enables assistant-to-assistant communication. When your OpenClaw assistant needs to coordinate with a colleague's assistant -- to answer a question, schedule a meeting, or fulfill a request -- it uses OCIP to exchange structured messages through existing messaging channels like Slack.

---

## What OCIP Is

OCIP is a protocol, not a separate system. It works by wrapping machine-readable metadata (the "OCIP envelope") around messages sent through channels you already use. Two assistants can exchange information, coordinate schedules, or negotiate on behalf of their users -- all governed by strict policies on what is permitted.

### Key Properties

- **Uses existing channels.** OCIP messages travel through Slack (via OpenClaw's built-in integration). No new infrastructure is needed.
- **Human-readable and machine-readable.** OCIP messages include both a human-readable body and a machine-parseable envelope.
- **Policy-governed at every step.** Data classification, autonomy levels, loop limits, and commitment rules are all enforced by the policy engine.
- **Audited on both sides.** Both the sending and receiving assistant log the full exchange.

---

## The OCIP Envelope

Every OCIP message includes an envelope with structured metadata:

```json
{
  "ocip_version": "1.0",
  "message_type": "request",
  "source_agent": {
    "user": "jdoe@company.com",
    "instance": "openclaw-prod-01"
  },
  "exchange_type": "information_query",
  "exchange_id": "exc-2026-0313-a8f2",
  "data_classification": "internal",
  "round": 1,
  "max_rounds": 3,
  "reply_policy": "agent-ok",
  "commitment": false
}
```

### Envelope Fields

| Field | Description |
|---|---|
| `ocip_version` | Protocol version (currently 1.0) |
| `message_type` | `request`, `response`, or `escalation` |
| `source_agent` | Identity of the sending user and OpenClaw instance |
| `exchange_type` | Category of the exchange (see below) |
| `exchange_id` | Unique identifier for this conversation thread |
| `data_classification` | Highest classification level of data in this message |
| `round` | Current round number in the exchange |
| `max_rounds` | Maximum rounds allowed before human escalation |
| `reply_policy` | How the receiver should handle this message |
| `commitment` | Whether this message involves a commitment |

---

## Exchange Types

OCIP supports three exchange types:

### 1. Information Query

One assistant asks another for information on behalf of its user.

**Example:** Your assistant asks a colleague's assistant for the status of a shared project.

```
[OCIP Envelope: information_query, round 1/3, classification: internal]

From: jdoe's assistant
To: asmith's assistant

Could you provide the current status of Project Atlas?
Specifically: milestone completion percentage and any blocking issues.
```

The receiving assistant can answer autonomously if its user's policy allows, or it can queue the query for human review.

### 2. Commitment Request

One assistant requests a commitment from another user (e.g., agreeing to a deadline, taking on a task).

**Example:** Your assistant asks a colleague's assistant whether they can review a document by Friday.

```
[OCIP Envelope: commitment_request, round 1/2, classification: internal]

From: jdoe's assistant
To: asmith's assistant

Can A. Smith review the API migration runbook by Friday, March 15?
Document: https://drive.google.com/...
Estimated review time: 30 minutes.
```

> **Important:** Commitment requests ALWAYS escalate to the receiving user for human approval. This is a structural guarantee in the protocol, not a configurable policy. No assistant can make commitments on behalf of its user without explicit human confirmation.

### 3. Meeting Scheduling

Assistants negotiate meeting times by exchanging calendar availability.

**Example:**

```
[OCIP Envelope: meeting_scheduling, round 1/4, classification: internal]

From: jdoe's assistant
To: asmith's assistant

J. Doe would like to schedule a 30-minute sync about Project Atlas.
Available slots (next 5 business days):
  - Mon 3/16: 10:00-11:00, 14:00-15:00
  - Tue 3/17: 09:00-10:00, 13:00-14:00
  - Wed 3/18: 10:00-12:00
```

The receiving assistant checks its user's calendar and responds with compatible slots. No commitment is made until both users (or their policies) confirm.

---

## Reply Policies

Each OCIP message specifies how the receiver should handle it:

| Reply Policy | Meaning |
|---|---|
| `agent-ok` | The receiving assistant can respond autonomously if its user's policy allows. |
| `human-only` | The receiving assistant must queue the message for its user. No autonomous response is permitted. |
| `no-reply-needed` | Informational message. No response expected. |

The reply policy is a request from the sender. The receiver's own policies may impose stricter requirements. For example, even if the sender says `agent-ok`, the receiver's policy may require human approval for all external exchanges.

---

## Data Classification Enforcement

OCIP enforces data classification at the sender side. Before any message is transmitted:

1. The sender's assistant determines the data classification of all information in the message.
2. The receiver's clearance level is checked against the organization's policy.
3. **Any data above the receiver's clearance level is excluded from the message.**

### Example

Suppose your assistant is responding to an information query about Project Atlas. The project data includes:

- Milestone status: classified as `internal`
- Budget figures: classified as `confidential`
- Team member names: classified as `internal`

If the receiving user's clearance is `internal`, the response will include milestone status and team member names but **exclude budget figures entirely**. The response will note that some information was withheld due to classification restrictions.

```
[OCIP Envelope: information_query response, classification: internal]

Project Atlas Status:
  - Milestone 1: Complete
  - Milestone 2: 75% complete, on track
  - Milestone 3: Not started (blocked by infrastructure dependency)
  - Team: 4 engineers, 1 PM

Note: Some fields were excluded due to data classification restrictions.
```

---

## Loop Prevention

To prevent assistants from entering infinite back-and-forth exchanges, OCIP enforces round limits:

- Each exchange has a `max_rounds` value set by policy (e.g., 3 rounds for information queries, 4 rounds for meeting scheduling).
- The `round` counter increments with each message in the exchange.
- **When `round` exceeds `max_rounds`, the exchange is escalated to both humans.**

### What Escalation Looks Like

```
[OCIP Exchange Escalated]
Exchange: exc-2026-0313-a8f2 (information_query)
Reason: Maximum rounds (3) exceeded without resolution.

Summary of exchange:
  Round 1: jdoe's assistant asked for Project Atlas status.
  Round 2: asmith's assistant requested clarification on which metrics.
  Round 3: jdoe's assistant specified milestone completion and blockers.
  (No response received within round limit)

Action required: Please continue this conversation directly.
```

Both users receive the escalation notice with the full exchange history.

---

## Commitment Detection

OCIP includes structural safeguards around commitments:

- **Any message that requests a commitment is flagged with `commitment: true` in the envelope.**
- **Commitment requests ALWAYS escalate to the human for approval.** This is not configurable. No policy can authorize an assistant to make commitments autonomously.
- Commitments include: agreeing to deadlines, accepting tasks, approving requests, making promises.

This guarantee exists because commitments have real-world consequences that require human judgment. The protocol enforces this at the structural level, independent of any policy configuration.

---

## Cross-Organization Boundaries

### Same Enterprise

Assistants within the same enterprise can communicate freely via OCIP, subject to:

- Data classification enforcement
- Round limits
- Commitment escalation rules
- Organization-specific policies

### Cross-Enterprise

**Cross-enterprise OCIP communication is unconditionally blocked.**

There is no policy setting to enable it. Assistants belonging to different enterprises cannot exchange OCIP messages. This is a hard boundary in the protocol.

If cross-enterprise communication is needed, it must happen through direct human interaction on existing channels.

---

## Dual-Sided Audit Logging

Every OCIP exchange is logged by both participants. The audit record includes:

| Field | Description |
|---|---|
| Exchange ID | Unique identifier for the conversation |
| Direction | Sent or received |
| Timestamp | When the message was sent/received |
| Sender identity | User and instance that sent the message |
| Receiver identity | User and instance that received the message |
| Exchange type | information_query, commitment_request, or meeting_scheduling |
| Round number | Which round of the exchange |
| Data classification | Classification level of the message |
| Full message content | The complete message body |
| Envelope metadata | All OCIP envelope fields |
| Policy applied | Which policy rules governed the exchange |
| Action taken | Sent autonomously, queued for human, escalated, or blocked |

Both the sender's and receiver's administrators can independently audit any exchange from their side.

---

## Viewing OCIP Activity

- *"Show me recent agent-to-agent exchanges"*
- *"What OCIP messages were sent on my behalf today?"*
- *"Show me pending commitment requests"*
- *"List all exchanges with asmith's assistant this week"*

---

## Example: Full Exchange Flow

Here is a complete information query exchange:

**Round 1 -- Your assistant sends a query:**

```
[OCIP: information_query, round 1/3, reply_policy: agent-ok, classification: internal]

From: jdoe's assistant
To: asmith's assistant

What is the current deployment status of the auth-service v2.4 release?
```

**Round 2 -- Colleague's assistant responds (autonomously, per their policy):**

```
[OCIP: information_query response, round 2/3, classification: internal]

From: asmith's assistant
To: jdoe's assistant

Auth-service v2.4 deployment status:
  - Staging: deployed, all tests passing
  - Production: blocked by security review (SECR-201)
  - ETA: pending review completion, estimated Thursday 3/14
```

**Your assistant delivers the answer to you:**

```
I checked with A. Smith's assistant about auth-service v2.4:

  - Staging is deployed and passing tests.
  - Production deployment is blocked by security review SECR-201.
  - Estimated deployment: Thursday, March 14.

This was retrieved via OCIP (exchange exc-2026-0313-a8f2, 2 rounds, classification: internal).
```

The exchange completed in 2 rounds (within the 3-round limit), both sides logged it, and no human intervention was required because the receiver's policy allowed autonomous responses to internal information queries.
