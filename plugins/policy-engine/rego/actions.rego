package openclaw.enterprise.actions

import rego.v1

default allow := false
default require_approval := false

# Check action autonomy level from policy
autonomy_level := data.policy.actions[input.action] if {
    data.policy.actions[input.action]
}
autonomy_level := data.policy.default_autonomy if {
    not data.policy.actions[input.action]
    data.policy.default_autonomy
}
autonomy_level := "approve" if {
    not data.policy.actions[input.action]
    not data.policy.default_autonomy
}

# Allow autonomous actions
allow if {
    autonomy_level == "autonomous"
}

# Allow with notification
allow if {
    autonomy_level == "notify"
}

# Require approval
require_approval if {
    autonomy_level == "approve"
}

# Block
deny if {
    autonomy_level == "block"
}

# Block if action is in the blocked list
deny if {
    input.action in data.policy.blocked
}

reason := "Action blocked by policy" if { deny }
reason := "Action requires approval" if { require_approval }
reason := "Action allowed" if { allow }
reason := "No matching rule — default: deny" if { not allow; not require_approval; not deny }

constraints := {
    "disclosure_required": autonomy_level == "notify",
}
