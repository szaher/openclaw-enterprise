package webhook

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	openclawv1 "github.com/szaher/openclaw-enterprise/operator/api/v1"
	"github.com/szaher/openclaw-enterprise/operator/internal/controller"
)

// PolicyBundleValidator validates PolicyBundle admission requests.
type PolicyBundleValidator struct {
	Decoder admission.Decoder
}

// Handle processes admission requests for PolicyBundle resources.
// It validates hierarchy constraints before admitting the CR.
func (v *PolicyBundleValidator) Handle(ctx context.Context, req admission.Request) admission.Response {
	bundle := &openclawv1.PolicyBundle{}

	if err := v.Decoder.Decode(req, bundle); err != nil {
		return admission.Errored(http.StatusBadRequest,
			fmt.Errorf("failed to decode PolicyBundle: %w", err))
	}

	// Structural validation
	if errs := controller.ValidatePolicyBundle(bundle); len(errs) > 0 {
		return admission.Denied(fmt.Sprintf("PolicyBundle validation failed: %s",
			strings.Join(errs, "; ")))
	}

	// Hierarchy constraint validation:
	// Lower scopes must not expand beyond parent scopes.
	// Within a single bundle we check that no policy at a child scope
	// exists without a corresponding parent scope policy in the same domain.
	scopesByDomain := make(map[string][]openclawv1.PolicyScope)
	for _, p := range bundle.Spec.Policies {
		scopesByDomain[p.Domain] = append(scopesByDomain[p.Domain], p.Scope)
	}

	scopeOrder := map[openclawv1.PolicyScope]int{
		openclawv1.PolicyScopeEnterprise: 0,
		openclawv1.PolicyScopeOrg:        1,
		openclawv1.PolicyScopeTeam:       2,
		openclawv1.PolicyScopeUser:       3,
	}

	for domain, scopes := range scopesByDomain {
		// Find the highest (broadest) scope in this domain
		highestScope := -1
		for _, s := range scopes {
			order, ok := scopeOrder[s]
			if !ok {
				return admission.Denied(fmt.Sprintf("domain %q: unknown scope %q", domain, s))
			}
			if highestScope == -1 || order < highestScope {
				highestScope = order
			}
		}

		// Validate that child scopes only restrict, never expand
		for _, s := range scopes {
			order := scopeOrder[s]
			if order > highestScope {
				// This is a child scope; validate hierarchy
				parentScope := findParentScope(scopes, s, scopeOrder)
				if parentScope != "" {
					if msg := controller.ValidateHierarchy(s, parentScope); msg != "" {
						return admission.Denied(fmt.Sprintf("domain %q: %s", domain, msg))
					}
				}
			}
		}
	}

	return admission.Allowed("PolicyBundle is valid")
}

// findParentScope finds the nearest parent scope for a given child scope.
func findParentScope(scopes []openclawv1.PolicyScope, child openclawv1.PolicyScope,
	scopeOrder map[openclawv1.PolicyScope]int) openclawv1.PolicyScope {

	childOrder := scopeOrder[child]
	bestParent := openclawv1.PolicyScope("")
	bestOrder := -1

	for _, s := range scopes {
		order := scopeOrder[s]
		if order < childOrder && order > bestOrder {
			bestParent = s
			bestOrder = order
		}
	}

	return bestParent
}
