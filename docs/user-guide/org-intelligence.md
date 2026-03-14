# Org Intelligence

Org Intelligence monitors your organization's information streams and documents, filters what matters to you, and alerts you to important changes. It delivers personalized news digests, tracks document modifications, and flags contradictions between related documents.

---

## News Aggregation

The system monitors organization-wide channels (Slack channels, shared inboxes, announcement feeds) and scores each item's relevance to you personally.

### Relevance Categories

Every item is classified into one of four relevance levels:

| Category | Description | Example |
|---|---|---|
| **Must-read** | Directly affects your work, team, or responsibilities. Requires awareness or action. | Security policy change affecting your service, team reorg announcement, production incident in your domain |
| **Should-read** | Related to your projects or role. Not immediately actionable but important context. | Adjacent team's architecture decision, company-wide process change, partner team milestone |
| **Nice-to-know** | Tangentially related. May be useful background. | Other department's product launch, company social event, industry article shared internally |
| **Skip** | Not relevant to your role or projects. Filtered out of your digest. | Announcements for other offices, teams, or product lines with no overlap to your work |

### Personalization Signals

Relevance scoring uses:

- **Your role** -- engineering, product, management, etc.
- **Your projects** -- active Jira projects, GitHub repositories, team channels you participate in.
- **Your interaction history** -- topics you have engaged with previously.
- **Organizational hierarchy** -- announcements from your management chain score higher.

### Digest Delivery

Digests are available in two cadences:

| Cadence | Contents |
|---|---|
| **Daily digest** | All must-read and should-read items from the past 24 hours. |
| **Weekly digest** | Aggregated summary of the week, including trends and nice-to-know items that accumulated significance. |

### Example Daily Digest

```
Org Intelligence Daily Digest -- Wednesday, March 13, 2026
============================================================

MUST-READ (3 items):

  1. [Security] New API authentication requirements effective March 20
     Source: #announcements, posted by CISO
     Impact: All services must migrate to mTLS by March 20.
     Your services affected: api-gateway, auth-service

  2. [Engineering] Kubernetes cluster upgrade scheduled March 15-16
     Source: #infrastructure, posted by Platform Team
     Impact: Potential downtime for staging environments.
     Your namespaces affected: team-backend-staging

  3. [Team] Sprint review moved to Thursday 14:00
     Source: #team-backend, posted by J. Martinez
     Impact: Conflicts with your 1:1 (rescheduling suggested).

SHOULD-READ (5 items):

  4. [Product] Q2 roadmap draft shared for review
     Source: #product, posted by VP Product
     Relevance: Contains priorities for your team's domain.

  5. [Engineering] New shared library for observability released (v2.0)
     Source: #platform-updates, posted by Platform Team
     Relevance: Your services use the previous version.

  ... (3 more)

NICE-TO-KNOW: 12 items (ask "show nice-to-know items" to view)
SKIPPED: 34 items
```

### Requesting Digests

- *"Show me my org digest"*
- *"What must-read announcements did I miss this week?"*
- *"Show me org news related to security"*
- *"Give me the weekly summary"*

---

## Document Change Monitoring

Org Intelligence watches specified documents for changes and notifies you when something significant is modified.

### Monitored Document Types

Your administrator configures which documents are watched. Common targets include:

- Architecture decision records (ADRs)
- Security policies and runbooks
- API specifications
- Team processes and onboarding guides
- Compliance documentation

You can also request monitoring for specific documents:

- *"Watch the API gateway architecture doc for changes"*
- *"Monitor the incident response runbook"*

### Change Classification

Not every document edit is worth your attention. Changes are classified by significance:

| Classification | Description | Notification |
|---|---|---|
| **Critical** | Fundamental changes to requirements, security posture, or architectural decisions. | Immediate notification with detailed summary. |
| **Substantive** | Meaningful content additions, modifications, or removals that change how something works. | Included in your next digest with summary. |
| **Minor** | Small clarifications, typo fixes, formatting improvements that do not change meaning. | Included in digest as a single line item. |
| **Cosmetic** | Whitespace changes, style adjustments, reordering without content changes. | **Suppressed.** Not shown unless you ask. |

### Change Summaries

When a substantive or critical change is detected, the system provides a structured summary:

```
Document Change Alert
======================
Document: API Gateway Architecture (v3.2 -> v3.3)
Author: L. Park
Changed: March 13, 2026 at 14:22
Classification: Substantive

What Changed:
  - Rate limiting section rewritten to use token bucket algorithm
    (previously: sliding window)
  - New section added: "Circuit Breaker Configuration"
  - Retry policy defaults modified: max retries 5 -> 3

What Was Added:
  - Circuit breaker thresholds and recovery procedures
  - Monitoring dashboard links for rate limiting

What Was Modified:
  - Rate limiting algorithm and configuration parameters
  - Default retry count reduced

What Was Removed:
  - Legacy sliding window rate limiter documentation

Impact on You:
  - Your api-gateway service uses rate limiting -- verify
    configuration matches new token bucket parameters.
  - PR #412 may need updates to align with new defaults.
```

### Viewing Document Changes

- *"Show me document changes from this week"*
- *"What changed in the security policy?"*
- *"Show me all critical document changes"*
- *"Show me the diff for the API gateway architecture doc"*

---

## Cross-Document Consistency Checking

When multiple related documents are monitored, Org Intelligence checks for contradictions between them.

### How It Works

1. The system identifies relationships between monitored documents (e.g., an architecture doc and a runbook for the same service).
2. When one document is updated, it compares the changes against related documents.
3. If a contradiction is found, it flags the inconsistency for review.

### Example: Detected Contradiction

```
Consistency Alert
==================
Contradiction detected between 2 documents:

Document A: API Gateway Architecture (v3.3)
  States: "Default retry count: 3"

Document B: API Gateway Runbook (v2.1, last updated Feb 28)
  States: "Default retry count: 5"

Analysis:
  The architecture doc was updated on March 13 to reduce the default
  retry count from 5 to 3. The runbook was not updated and still
  references the old value.

Recommendation:
  Update the API Gateway Runbook to reflect the new retry count of 3.

Affected users: 4 team members are watching both documents.
```

### What Gets Checked

The consistency checker looks for:

- **Numeric contradictions** -- different values for the same parameter across documents.
- **Process contradictions** -- conflicting step sequences or procedures.
- **Policy contradictions** -- different rules stated in overlapping policy documents.
- **Status contradictions** -- one document says a feature is deprecated while another references it as active.

### Limitations

- Consistency checking compares monitored documents only. It cannot check documents that are not being watched.
- The system identifies potential contradictions. Some may be intentional (e.g., a document deliberately overrides a default). Review flagged items to determine if action is needed.

---

## Configuration

### Adding Documents to Watch

- *"Watch https://drive.google.com/d/... for changes"*
- *"Monitor the incident response runbook in Google Drive"*
- *"Stop watching the old API spec"*

### Adjusting Relevance

If the system consistently miscategorizes items for you:

- *"Mark infrastructure announcements as must-read for me"*
- *"Skip all marketing channel updates"*
- *"The Q2 roadmap is should-read, not nice-to-know"*

The system incorporates these corrections into future relevance scoring.

### Digest Preferences

- *"Switch to weekly-only digests"*
- *"Send me daily digests at 08:30"*
- *"Include nice-to-know items in my daily digest"*

---

## Best Practices

1. **Start with your team's core documents.** Monitor architecture docs, runbooks, and security policies for your services first.
2. **Review must-read items daily.** These are filtered to be genuinely important. Ignoring them risks missing critical changes.
3. **Correct relevance mistakes early.** The more feedback you provide, the better the personalization becomes.
4. **Act on consistency alerts.** Contradictions between documents are a common source of incidents. Flagged contradictions should be resolved or acknowledged promptly.
5. **Use weekly digests for broader awareness.** Nice-to-know items that seem minor individually may reveal important organizational trends when viewed weekly.
