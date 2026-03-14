package openclaw.enterprise.audit

import rego.v1

default allow := true

# Audit logging is always allowed — never blocked
# This policy governs WHAT is logged and WHO can query

reason := "Audit actions always permitted"

constraints := {
    "log_all_actions": data.policy.log_all_actions,
    "retention_years": data.policy.retention_years,
}
