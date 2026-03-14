package openclaw.enterprise.features

import rego.v1

default allow := false

# Check if the requested feature is enabled
allow if {
    feature_name := input.additional.feature
    data.policy[feature_name] == true
}

reason := "Feature enabled" if { allow }
reason := "Feature disabled by policy" if { not allow }

constraints := {}
