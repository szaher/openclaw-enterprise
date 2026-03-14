package tests

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	openclawv1 "github.com/szaher/openclaw-enterprise/operator/api/v1"
	"github.com/szaher/openclaw-enterprise/operator/internal/controller"
)

func newTestPolicyBundle(name, namespace string, policies []openclawv1.PolicyDefinition) *openclawv1.PolicyBundle {
	return &openclawv1.PolicyBundle{
		ObjectMeta: metav1.ObjectMeta{
			Name:       name,
			Namespace:  namespace,
			Generation: 1,
		},
		Spec: openclawv1.PolicyBundleSpec{
			Policies: policies,
		},
	}
}

func TestPolicyReconcile_CreatesConfigMap(t *testing.T) {
	scheme := newTestScheme()
	bundle := newTestPolicyBundle("test-bundle", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "models",
			Name:    "model-routing",
			Content: "package openclaw.models\ndefault allow = false",
		},
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "actions",
			Name:    "action-autonomy",
			Content: "package openclaw.actions\ndefault allow = true",
		},
	})

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(bundle).
		WithStatusSubresource(bundle).
		Build()

	reconciler := &controller.PolicyBundleReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "test-bundle",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	// Verify ConfigMap was created
	cm := &corev1.ConfigMap{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "test-bundle-opa-policies",
		Namespace: "default",
	}, cm)
	if err != nil {
		t.Fatalf("expected configmap to be created: %v", err)
	}

	if len(cm.Data) != 2 {
		t.Errorf("expected 2 policy entries in configmap, got %d", len(cm.Data))
	}

	// Check that keys follow the naming convention
	if _, ok := cm.Data["enterprise-models-model-routing.rego"]; !ok {
		t.Error("expected key 'enterprise-models-model-routing.rego' in configmap")
	}
	if _, ok := cm.Data["enterprise-actions-action-autonomy.rego"]; !ok {
		t.Error("expected key 'enterprise-actions-action-autonomy.rego' in configmap")
	}
}

func TestPolicyReconcile_UpdatesExistingConfigMap(t *testing.T) {
	scheme := newTestScheme()
	bundle := newTestPolicyBundle("update-bundle", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "data",
			Name:    "classification",
			Content: "package openclaw.data\ndefault classification = \"confidential\"",
		},
	})

	// Pre-create an existing ConfigMap
	existingCM := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "update-bundle-opa-policies",
			Namespace: "default",
		},
		Data: map[string]string{
			"old-policy.rego": "package old\n",
		},
	}

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(bundle, existingCM).
		WithStatusSubresource(bundle).
		Build()

	reconciler := &controller.PolicyBundleReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "update-bundle",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	cm := &corev1.ConfigMap{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "update-bundle-opa-policies",
		Namespace: "default",
	}, cm)
	if err != nil {
		t.Fatalf("expected configmap: %v", err)
	}

	// Old policy should be gone, new one present
	if _, ok := cm.Data["old-policy.rego"]; ok {
		t.Error("old policy should have been replaced")
	}
	if _, ok := cm.Data["enterprise-data-classification.rego"]; !ok {
		t.Error("expected new policy key in configmap")
	}
}

func TestValidatePolicyBundle_EmptyPolicies(t *testing.T) {
	bundle := newTestPolicyBundle("empty", "default", []openclawv1.PolicyDefinition{})
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) == 0 {
		t.Error("expected validation error for empty policies")
	}
}

func TestValidatePolicyBundle_InvalidDomain(t *testing.T) {
	bundle := newTestPolicyBundle("invalid-domain", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "nonexistent",
			Name:    "test",
			Content: "package test",
		},
	})
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) == 0 {
		t.Error("expected validation error for invalid domain")
	}
}

func TestValidatePolicyBundle_MissingName(t *testing.T) {
	bundle := newTestPolicyBundle("no-name", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "models",
			Name:    "",
			Content: "package test",
		},
	})
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) == 0 {
		t.Error("expected validation error for empty name")
	}
}

func TestValidatePolicyBundle_MissingContent(t *testing.T) {
	bundle := newTestPolicyBundle("no-content", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "models",
			Name:    "test",
			Content: "",
		},
	})
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) == 0 {
		t.Error("expected validation error for empty content")
	}
}

func TestValidatePolicyBundle_ValidBundle(t *testing.T) {
	bundle := newTestPolicyBundle("valid", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "models",
			Name:    "model-routing",
			Content: "package openclaw.models\ndefault allow = false",
		},
		{
			Scope:   openclawv1.PolicyScopeOrg,
			Domain:  "actions",
			Name:    "org-actions",
			Content: "package openclaw.actions\ndefault allow = true",
		},
	})
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) != 0 {
		t.Errorf("expected no validation errors, got: %v", errs)
	}
}

func TestValidateHierarchy_ValidChildScope(t *testing.T) {
	msg := controller.ValidateHierarchy(openclawv1.PolicyScopeOrg, openclawv1.PolicyScopeEnterprise)
	if msg != "" {
		t.Errorf("expected valid hierarchy, got: %s", msg)
	}
}

func TestValidateHierarchy_InvalidSameLevel(t *testing.T) {
	msg := controller.ValidateHierarchy(openclawv1.PolicyScopeEnterprise, openclawv1.PolicyScopeEnterprise)
	if msg == "" {
		t.Error("expected error for same-level hierarchy")
	}
}

func TestValidateHierarchy_InvalidChildHigherThanParent(t *testing.T) {
	msg := controller.ValidateHierarchy(openclawv1.PolicyScopeEnterprise, openclawv1.PolicyScopeOrg)
	if msg == "" {
		t.Error("expected error when child scope is broader than parent")
	}
}

func TestValidateHierarchy_DeepNesting(t *testing.T) {
	msg := controller.ValidateHierarchy(openclawv1.PolicyScopeUser, openclawv1.PolicyScopeEnterprise)
	if msg != "" {
		t.Errorf("expected valid deep nesting, got: %s", msg)
	}
}

func TestPolicyReconcile_NotFoundIgnored(t *testing.T) {
	scheme := newTestScheme()

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		Build()

	reconciler := &controller.PolicyBundleReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "nonexistent",
			Namespace: "default",
		},
	}

	result, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile should not error on not-found: %v", err)
	}
	if result.Requeue {
		t.Error("should not requeue on not-found")
	}
}

func TestPolicyReconcile_AllDomains(t *testing.T) {
	domains := []string{"models", "actions", "integrations", "agent-to-agent", "features", "data", "audit"}

	policies := make([]openclawv1.PolicyDefinition, len(domains))
	for i, d := range domains {
		policies[i] = openclawv1.PolicyDefinition{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  d,
			Name:    d + "-policy",
			Content: "package openclaw." + d + "\ndefault allow = false",
		}
	}

	bundle := newTestPolicyBundle("all-domains", "default", policies)
	errs := controller.ValidatePolicyBundle(bundle)
	if len(errs) != 0 {
		t.Errorf("all 7 domains should be valid, got errors: %v", errs)
	}
}

func TestPolicyReconcile_StatusUpdated(t *testing.T) {
	scheme := newTestScheme()
	bundle := newTestPolicyBundle("status-test", "default", []openclawv1.PolicyDefinition{
		{
			Scope:   openclawv1.PolicyScopeEnterprise,
			Domain:  "models",
			Name:    "test-policy",
			Content: "package test\ndefault allow = false",
		},
	})

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(bundle).
		WithStatusSubresource(bundle).
		Build()

	reconciler := &controller.PolicyBundleReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "status-test",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	// Re-fetch the bundle to check status
	updated := &openclawv1.PolicyBundle{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "status-test",
		Namespace: "default",
	}, updated)
	if err != nil {
		t.Fatalf("failed to get updated bundle: %v", err)
	}

	if updated.Status.Applied != 1 {
		t.Errorf("expected 1 applied policy, got %d", updated.Status.Applied)
	}
	if updated.Status.Total != 1 {
		t.Errorf("expected 1 total policy, got %d", updated.Status.Total)
	}
	if updated.Status.LastReloadTime == nil {
		t.Error("expected LastReloadTime to be set")
	}
}
