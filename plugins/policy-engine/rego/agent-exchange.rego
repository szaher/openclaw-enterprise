package openclaw.enterprise.agent_exchange

import rego.v1

default allow := false
default require_approval := false

# Agent exchanges enabled
exchanges_enabled if {
    data.policy.enabled == true
}

# Check exchange type is allowed
exchange_type_allowed if {
    input.additional.exchange_type in data.policy.allowed_exchange_types
}

# Check classification level
classification_allowed if {
    classification_order[input.data_classification] <= classification_order[data.policy.max_classification_shared]
}

classification_order := {
    "public": 0,
    "internal": 1,
    "confidential": 2,
    "restricted": 3,
}

# Block cross-enterprise unconditionally
cross_enterprise if {
    input.additional.source_tenant != input.additional.target_tenant
}

# Cross-org within same enterprise
cross_org if {
    input.additional.source_org != input.additional.target_org
    not cross_enterprise
}

allow if {
    exchanges_enabled
    exchange_type_allowed
    classification_allowed
    not cross_enterprise
    not cross_org
}

# Cross-org allowed if policy permits
allow if {
    exchanges_enabled
    exchange_type_allowed
    classification_allowed
    cross_org
    data.policy.cross_org == true
}

# Commitment requests always require human approval
require_approval if {
    input.additional.exchange_type == "commitment_request"
}

reason := "Agent exchanges disabled" if { not exchanges_enabled }
reason := "Cross-enterprise exchanges blocked" if { cross_enterprise }
reason := "Cross-org exchanges not allowed by policy" if { cross_org; not data.policy.cross_org }
reason := "Exchange type not allowed" if { not exchange_type_allowed }
reason := "Classification exceeds sharing limit" if { not classification_allowed }
reason := "Commitment requires human approval" if { require_approval }
reason := "Exchange allowed" if { allow }

constraints := {
    "max_classification": data.policy.max_classification_shared,
    "max_rounds": data.policy.max_rounds,
}
