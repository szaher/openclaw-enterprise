package openclaw.enterprise.integrations

import rego.v1

default allow := false
default require_approval := false

# Extract connector type from action name (e.g., "email_read" -> "gmail")
connector_type := "gmail" if { startswith(input.action, "email_") }
connector_type := "gcal" if { startswith(input.action, "calendar_") }
connector_type := "jira" if { startswith(input.action, "jira_") }
connector_type := "github" if { startswith(input.action, "github_") }
connector_type := "gdrive" if { startswith(input.action, "gdrive_") }

# Check if connector is enabled
connector_enabled if {
    data.policy.connectors[connector_type].enabled == true
}

# Check connector permissions
connector_permissions := data.policy.connectors[connector_type].permissions if {
    data.policy.connectors[connector_type].permissions
}
connector_permissions := "read" if {
    not data.policy.connectors[connector_type].permissions
}

is_read_action if { endswith(input.action, "_read") }
is_read_action if { endswith(input.action, "_search") }

is_write_action if { not is_read_action }

# Allow read actions when connector is enabled
allow if {
    connector_enabled
    is_read_action
}

# Allow write actions only with write/admin permissions
allow if {
    connector_enabled
    is_write_action
    connector_permissions in ["write", "admin"]
}

# Require approval for write actions when connector has read-only permissions
require_approval if {
    connector_enabled
    is_write_action
    connector_permissions == "read"
}

reason := "Connector not enabled" if { not connector_enabled }
reason := "Read-only connector — write action requires approval" if { require_approval }
reason := "Connector access allowed" if { allow }
reason := "Write action denied — read-only permissions" if { not allow; not require_approval; connector_enabled }

constraints := {
    "max_classification": data.policy.connectors[connector_type].max_classification,
}
