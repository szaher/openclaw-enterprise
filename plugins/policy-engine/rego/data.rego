package openclaw.enterprise.data

import rego.v1

default allow := false

classification_order := {
    "public": 0,
    "internal": 1,
    "confidential": 2,
    "restricted": 3,
}

# Allow data access within allowed classification
allow if {
    max_level := data.policy.external_sharing_max
    classification_order[input.data_classification] <= classification_order[max_level]
}

reason := "Data access allowed within classification" if { allow }
reason := "Data classification exceeds allowed sharing level" if { not allow }

constraints := {
    "max_classification": data.policy.external_sharing_max,
}
