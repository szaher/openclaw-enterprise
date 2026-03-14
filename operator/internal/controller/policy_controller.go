package controller

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	openclawv1 "github.com/szaher/openclaw-enterprise/operator/api/v1"
)

// ValidPolicyDomains lists the accepted policy domain values.
var ValidPolicyDomains = map[string]bool{
	"models":         true,
	"actions":        true,
	"integrations":   true,
	"agent-to-agent": true,
	"features":       true,
	"data":           true,
	"audit":          true,
}

// PolicyBundleReconciler reconciles a PolicyBundle object.
type PolicyBundleReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=policybundles,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=policybundles/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=policybundles/finalizers,verbs=update
// +kubebuilder:rbac:groups=core,resources=configmaps,verbs=get;list;watch;create;update;patch;delete

// Reconcile handles create/update/delete of PolicyBundle resources.
func (r *PolicyBundleReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Fetch the PolicyBundle CR
	bundle := &openclawv1.PolicyBundle{}
	if err := r.Get(ctx, req.NamespacedName, bundle); err != nil {
		if errors.IsNotFound(err) {
			logger.Info("PolicyBundle resource not found; ignoring since it must be deleted")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "failed to get PolicyBundle")
		return ctrl.Result{}, err
	}

	// Validate the PolicyBundle
	if errs := ValidatePolicyBundle(bundle); len(errs) > 0 {
		errMsg := strings.Join(errs, "; ")
		logger.Error(fmt.Errorf("validation failed"), errMsg)
		return ctrl.Result{}, r.setCondition(ctx, bundle, openclawv1.ConditionTypePolicyReady, metav1.ConditionFalse,
			"ValidationFailed", errMsg)
	}

	// Apply policies to OPA ConfigMap
	applied, err := r.applyPolicies(ctx, bundle)
	if err != nil {
		logger.Error(err, "failed to apply policies")
		return ctrl.Result{}, r.setCondition(ctx, bundle, openclawv1.ConditionTypePolicySynced, metav1.ConditionFalse,
			"ApplyFailed", fmt.Sprintf("Failed to apply policies: %v", err))
	}

	// Update status
	now := metav1.Now()
	bundle.Status.Applied = applied
	bundle.Status.Total = len(bundle.Spec.Policies)
	bundle.Status.LastReloadTime = &now
	bundle.Status.ObservedGeneration = bundle.Generation

	if err := r.setCondition(ctx, bundle, openclawv1.ConditionTypePolicySynced, metav1.ConditionTrue,
		"PoliciesApplied", fmt.Sprintf("Successfully applied %d/%d policies", applied, len(bundle.Spec.Policies))); err != nil {
		return ctrl.Result{}, err
	}

	logger.Info("PolicyBundle reconciled", "applied", applied, "total", len(bundle.Spec.Policies))
	return ctrl.Result{}, nil
}

// ValidatePolicyBundle checks a PolicyBundle for correctness.
func ValidatePolicyBundle(bundle *openclawv1.PolicyBundle) []string {
	var errs []string

	if len(bundle.Spec.Policies) == 0 {
		errs = append(errs, "policies list must not be empty")
	}

	for i, p := range bundle.Spec.Policies {
		if p.Name == "" {
			errs = append(errs, fmt.Sprintf("policy[%d]: name is required", i))
		}
		if p.Content == "" {
			errs = append(errs, fmt.Sprintf("policy[%d]: content is required", i))
		}
		if !ValidPolicyDomains[p.Domain] {
			errs = append(errs, fmt.Sprintf("policy[%d]: invalid domain %q", i, p.Domain))
		}
		if p.Scope != openclawv1.PolicyScopeEnterprise &&
			p.Scope != openclawv1.PolicyScopeOrg &&
			p.Scope != openclawv1.PolicyScopeTeam &&
			p.Scope != openclawv1.PolicyScopeUser {
			errs = append(errs, fmt.Sprintf("policy[%d]: invalid scope %q", i, p.Scope))
		}
	}

	return errs
}

// ValidateHierarchy checks that child-scope policies do not expand beyond
// parent-scope policies. Returns an error message or empty string if valid.
func ValidateHierarchy(child, parent openclawv1.PolicyScope) string {
	scopeOrder := map[openclawv1.PolicyScope]int{
		openclawv1.PolicyScopeEnterprise: 0,
		openclawv1.PolicyScopeOrg:        1,
		openclawv1.PolicyScopeTeam:       2,
		openclawv1.PolicyScopeUser:       3,
	}

	childOrder, childOK := scopeOrder[child]
	parentOrder, parentOK := scopeOrder[parent]

	if !childOK || !parentOK {
		return fmt.Sprintf("unknown scope: child=%q parent=%q", child, parent)
	}

	if childOrder <= parentOrder {
		return fmt.Sprintf("scope %q cannot be at the same or higher level than parent scope %q", child, parent)
	}

	return ""
}

// applyPolicies writes each policy's Rego content into a ConfigMap that the
// OPA sidecar mounts, effectively triggering a hot-reload.
func (r *PolicyBundleReconciler) applyPolicies(ctx context.Context, bundle *openclawv1.PolicyBundle) (int, error) {
	cmName := fmt.Sprintf("%s-opa-policies", bundle.Name)
	data := make(map[string]string, len(bundle.Spec.Policies))

	for _, p := range bundle.Spec.Policies {
		// ConfigMap key: <scope>-<domain>-<sanitized-name>.rego
		key := fmt.Sprintf("%s-%s-%s.rego",
			string(p.Scope),
			strings.ReplaceAll(p.Domain, "-", "_"),
			sanitizeName(p.Name))
		data[key] = p.Content
	}

	desired := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cmName,
			Namespace: bundle.Namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "openclaw-operator",
				"app.kubernetes.io/component":  "opa-policies",
				"openclaw.enterprise.io/bundle": bundle.Name,
			},
		},
		Data: data,
	}

	if err := ctrl.SetControllerReference(bundle, desired, r.Scheme); err != nil {
		return 0, fmt.Errorf("setting controller reference on configmap: %w", err)
	}

	existing := &corev1.ConfigMap{}
	err := r.Get(ctx, types.NamespacedName{Name: cmName, Namespace: bundle.Namespace}, existing)
	if errors.IsNotFound(err) {
		if err := r.Create(ctx, desired); err != nil {
			return 0, fmt.Errorf("creating policy configmap: %w", err)
		}
		return len(bundle.Spec.Policies), nil
	}
	if err != nil {
		return 0, fmt.Errorf("getting existing policy configmap: %w", err)
	}

	existing.Data = data
	existing.Labels = desired.Labels
	if err := r.Update(ctx, existing); err != nil {
		return 0, fmt.Errorf("updating policy configmap: %w", err)
	}

	return len(bundle.Spec.Policies), nil
}

// setCondition updates a status condition and persists the status subresource.
func (r *PolicyBundleReconciler) setCondition(ctx context.Context, bundle *openclawv1.PolicyBundle,
	condType openclawv1.ConditionType, status metav1.ConditionStatus, reason, message string) error {

	condition := metav1.Condition{
		Type:               string(condType),
		Status:             status,
		ObservedGeneration: bundle.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	}

	found := false
	for i, c := range bundle.Status.Conditions {
		if c.Type == string(condType) {
			bundle.Status.Conditions[i] = condition
			found = true
			break
		}
	}
	if !found {
		bundle.Status.Conditions = append(bundle.Status.Conditions, condition)
	}

	return r.Status().Update(ctx, bundle)
}

// sanitizeName converts a policy name to a filesystem-safe string.
func sanitizeName(name string) string {
	replacer := strings.NewReplacer(" ", "_", "/", "_", "\\", "_", ".", "_")
	return strings.ToLower(replacer.Replace(name))
}

// SetupWithManager sets up the controller with the Manager.
func (r *PolicyBundleReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&openclawv1.PolicyBundle{}).
		Owns(&corev1.ConfigMap{}).
		Complete(r)
}
