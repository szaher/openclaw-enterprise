-- Default enterprise policies for all 7 domains
-- These provide secure defaults per constitution principles

INSERT INTO policies (scope, scope_id, domain, name, version, content, status, created_by, change_reason)
VALUES
  ('enterprise', 'default', 'models', 'Default Model Policy', '1.0.0',
   'allowed_providers:\n  - self-hosted\nsensitive_data_model: self-hosted\ncost_limits:\n  monthly_max_usd: 10000',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'actions', 'Default Action Policy', '1.0.0',
   'default_autonomy: approve\nblocked:\n  - deleteEmail\n  - closeGitHubPR\n  - deleteJiraTicket\nautonomous:\n  - email_read\n  - calendar_read\n  - jira_read\n  - github_pr_read\n  - gdrive_read',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'integrations', 'Default Integration Policy', '1.0.0',
   'default_permissions: read\nconnectors:\n  gmail:\n    enabled: true\n    permissions: read\n  gcal:\n    enabled: true\n    permissions: read\n  jira:\n    enabled: true\n    permissions: read\n  github:\n    enabled: true\n    permissions: read\n  gdrive:\n    enabled: true\n    permissions: read',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'agent-to-agent', 'Default Agent Exchange Policy', '1.0.0',
   'enabled: true\nallowed_exchange_types:\n  - information_query\nmax_rounds: 3\nmax_classification_shared: internal\ncross_org: false\ncross_enterprise: false',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'features', 'Default Features Policy', '1.0.0',
   'daily_briefing: true\nauto_response: false\nwork_tracking: false\nocip: false\norg_intelligence: false\nvisualization: true',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'data', 'Default Data Policy', '1.0.0',
   'classification_levels:\n  - public\n  - internal\n  - confidential\n  - restricted\nretention_days: 90\nexternal_sharing_max: internal\nraw_data_retention: ephemeral',
   'active', 'system', 'Initial default policy'),

  ('enterprise', 'default', 'audit', 'Default Audit Policy', '1.0.0',
   'log_all_actions: true\nlog_data_access: true\nlog_model_calls: true\nlog_policy_decisions: true\nlog_agent_exchanges: true\nretention_years: 1\nalert_on_deny: true',
   'active', 'system', 'Initial default policy');
