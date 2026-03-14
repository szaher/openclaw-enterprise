// Package v1 contains API Schema definitions for the openclaw.enterprise.io API group.
// +kubebuilder:object:generate=true
// +groupName=openclaw.enterprise.io
package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// DeploymentMode defines the deployment mode for an OpenClaw instance.
// +kubebuilder:validation:Enum=single;ha
type DeploymentMode string

const (
	DeploymentModeSingle DeploymentMode = "single"
	DeploymentModeHA     DeploymentMode = "ha"
)

// PolicyScope defines the hierarchical scope level for a policy.
// +kubebuilder:validation:Enum=enterprise;org;team;user
type PolicyScope string

const (
	PolicyScopeEnterprise PolicyScope = "enterprise"
	PolicyScopeOrg        PolicyScope = "org"
	PolicyScopeTeam       PolicyScope = "team"
	PolicyScopeUser       PolicyScope = "user"
)

// ConditionType defines the type of status condition.
type ConditionType string

const (
	ConditionTypeReady       ConditionType = "Ready"
	ConditionTypeProgressing ConditionType = "Progressing"
	ConditionTypeDegraded    ConditionType = "Degraded"
	ConditionTypePolicyReady ConditionType = "PolicyReady"
	ConditionTypePolicySynced ConditionType = "PolicySynced"
)

// -------------------------------------------------------------------
// OpenClawInstance
// -------------------------------------------------------------------

// OpenClawInstanceSpec defines the desired state of an OpenClaw Enterprise instance.
type OpenClawInstanceSpec struct {
	// DeploymentMode controls whether the instance runs as a single replica
	// or in high-availability mode.
	// +kubebuilder:default=single
	DeploymentMode DeploymentMode `json:"deploymentMode"`

	// Replicas is the number of gateway pod replicas.
	// Ignored when DeploymentMode is "single".
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	Replicas int32 `json:"replicas"`

	// Auth holds the SSO / OIDC authentication configuration.
	Auth AuthConfig `json:"auth"`

	// Storage holds references to PostgreSQL and Redis connection secrets.
	Storage StorageConfig `json:"storage"`

	// Integrations lists enabled connectors with their configuration.
	// +optional
	Integrations []IntegrationConfig `json:"integrations,omitempty"`

	// Images allows overriding the default container images for the gateway
	// and OPA sidecar. Useful for air-gapped environments or custom registries.
	// +optional
	Images *ImageOverrides `json:"images,omitempty"`
}

// ImageOverrides allows overriding the default container images.
type ImageOverrides struct {
	// Gateway is the enterprise gateway image (default: ghcr.io/szaher/openclaw-enterprise/gateway:latest).
	// +optional
	Gateway string `json:"gateway,omitempty"`

	// OPA is the OPA sidecar image (default: openpolicyagent/opa:1.4.2-static).
	// +optional
	OPA string `json:"opa,omitempty"`
}

// AuthConfig holds the SSO / OIDC configuration for an instance.
type AuthConfig struct {
	// Provider is the SSO provider name (e.g., "okta", "azure-ad", "keycloak").
	Provider string `json:"provider"`

	// ClientID is the OIDC client identifier.
	ClientID string `json:"clientId"`

	// ClientSecretRef is a reference to a Kubernetes Secret containing the
	// OIDC client secret.
	ClientSecretRef SecretReference `json:"clientSecretRef"`
}

// StorageConfig holds references to database connection secrets.
type StorageConfig struct {
	// PostgresSecretRef is a reference to a Kubernetes Secret containing
	// the PostgreSQL connection string (key: "connection-string").
	PostgresSecretRef SecretReference `json:"postgresSecretRef"`

	// RedisSecretRef is a reference to a Kubernetes Secret containing
	// the Redis connection string (key: "connection-string").
	RedisSecretRef SecretReference `json:"redisSecretRef"`
}

// SecretReference identifies a Kubernetes Secret by name and optional key.
type SecretReference struct {
	// Name is the name of the Kubernetes Secret.
	Name string `json:"name"`

	// Key is the key within the Secret data. Defaults to the conventional
	// key for the resource type if omitted.
	// +optional
	Key string `json:"key,omitempty"`
}

// IntegrationConfig describes an enabled connector and its settings.
type IntegrationConfig struct {
	// Type is the connector type (e.g., "gmail", "gcal", "jira", "github", "gdrive").
	Type string `json:"type"`

	// Enabled controls whether this connector is active.
	// +kubebuilder:default=true
	Enabled bool `json:"enabled"`

	// Config holds connector-specific configuration as key-value pairs.
	// +optional
	Config map[string]string `json:"config,omitempty"`
}

// OpenClawInstanceStatus defines the observed state of an OpenClaw Enterprise instance.
type OpenClawInstanceStatus struct {
	// ReadyReplicas is the number of gateway pods in a ready state.
	ReadyReplicas int32 `json:"readyReplicas,omitempty"`

	// Phase summarises the lifecycle phase of the instance.
	Phase string `json:"phase,omitempty"`

	// Conditions represent the latest available observations of the
	// instance's current state.
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ObservedGeneration is the most recent generation observed by the controller.
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=oci
// +kubebuilder:printcolumn:name="Mode",type=string,JSONPath=`.spec.deploymentMode`
// +kubebuilder:printcolumn:name="Replicas",type=integer,JSONPath=`.spec.replicas`
// +kubebuilder:printcolumn:name="Ready",type=integer,JSONPath=`.status.readyReplicas`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// OpenClawInstance is the Schema for the openclawinstances API.
// It represents a deployed OpenClaw Enterprise instance.
type OpenClawInstance struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   OpenClawInstanceSpec   `json:"spec,omitempty"`
	Status OpenClawInstanceStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// OpenClawInstanceList contains a list of OpenClawInstance.
type OpenClawInstanceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []OpenClawInstance `json:"items"`
}

// -------------------------------------------------------------------
// PolicyBundle
// -------------------------------------------------------------------

// PolicyBundleSpec defines the desired state of a PolicyBundle.
type PolicyBundleSpec struct {
	// Policies is the list of policy definitions in this bundle.
	Policies []PolicyDefinition `json:"policies"`
}

// PolicyDefinition describes a single policy within a bundle.
type PolicyDefinition struct {
	// Scope is the hierarchical scope this policy applies to.
	Scope PolicyScope `json:"scope"`

	// Domain is the policy domain (e.g., "models", "actions", "integrations",
	// "agent-to-agent", "features", "data", "audit").
	// +kubebuilder:validation:Enum=models;actions;integrations;agent-to-agent;features;data;audit
	Domain string `json:"domain"`

	// Name is a human-readable identifier for this policy.
	Name string `json:"name"`

	// Content is the Rego policy source or Cedar policy body.
	Content string `json:"content"`
}

// PolicyBundleStatus defines the observed state of a PolicyBundle.
type PolicyBundleStatus struct {
	// Applied indicates the number of policies successfully applied.
	Applied int `json:"applied,omitempty"`

	// Total is the total number of policies in this bundle.
	Total int `json:"total,omitempty"`

	// LastReloadTime records when policies were last reloaded into OPA.
	// +optional
	LastReloadTime *metav1.Time `json:"lastReloadTime,omitempty"`

	// Conditions represent the latest available observations of the
	// bundle's current state.
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ObservedGeneration is the most recent generation observed by the controller.
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=pb
// +kubebuilder:printcolumn:name="Applied",type=integer,JSONPath=`.status.applied`
// +kubebuilder:printcolumn:name="Total",type=integer,JSONPath=`.status.total`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// PolicyBundle is the Schema for the policybundles API.
// It represents a collection of policies to be loaded into the policy engine.
type PolicyBundle struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   PolicyBundleSpec   `json:"spec,omitempty"`
	Status PolicyBundleStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// PolicyBundleList contains a list of PolicyBundle.
type PolicyBundleList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []PolicyBundle `json:"items"`
}
