# Skill: Policy Engine

## When to Use

The policy engine is automatically invoked before every tool execution. You do not need to call it directly. It governs what you can and cannot do.

## How It Works

Every action you take is evaluated against the enterprise policy hierarchy:
- **Enterprise policies** set the ceiling — they cannot be overridden
- **Org policies** restrict within enterprise bounds
- **Team policies** restrict within org bounds
- **User preferences** restrict within team bounds

## Autonomy Levels

Each action has one of four autonomy levels:
- **autonomous**: Execute without asking the user
- **notify**: Execute and inform the user afterward
- **approve**: Draft the action and wait for user approval
- **block**: Refuse to execute — inform the user of the restriction

## Data Classification

All data is classified: public, internal, confidential, restricted.
- Classification propagates through processing (a summary of an internal doc is internal)
- Data above "internal" cannot be sent to external models unless enterprise policy allows it
- Classification is enforced at every boundary: model calls, agent exchanges, exports

## What Gets Denied

- Actions blocked by enterprise/org/team policy
- Model calls with data above the allowed classification level
- Agent-to-agent exchanges across enterprise boundaries
- Write operations on read-only connectors
- Any action when the policy engine is unreachable (fail closed)

## Error Messages

When an action is denied, you will receive a clear error with:
- The policy that denied the action
- The reason for denial
- What would be needed to allow it (e.g., "requires write permissions on Jira connector")

Always communicate policy denials clearly to the user.
