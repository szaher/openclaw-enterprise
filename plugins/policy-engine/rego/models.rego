package openclaw.enterprise.models

import rego.v1

default allow := false
default require_approval := false

# Allow model calls when classification is within allowed level
allow if {
    input.data_classification in allowed_classifications
}

# Block external models for confidential/restricted data
deny_reason := "Confidential/restricted data cannot be sent to external model providers" if {
    input.data_classification in ["confidential", "restricted"]
    not self_hosted_model
}

allow if {
    not deny_reason
    input.data_classification in allowed_classifications
}

reason := deny_reason if deny_reason
reason := "Model call allowed by policy" if not deny_reason

constraints := {
    "max_classification": max_classification,
}

# Defaults — overridden by loaded policy data
allowed_classifications := ["public", "internal"] if { not data.policy }
allowed_classifications := data.policy.allowed_classifications if { data.policy.allowed_classifications }

max_classification := "internal" if { not data.policy }
max_classification := data.policy.max_classification if { data.policy.max_classification }

self_hosted_model if { input.additional.provider == "self-hosted" }
