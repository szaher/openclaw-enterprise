import type { PolicyScope } from '@openclaw-enterprise/shared/types.js';
import { POLICY_SCOPE_HIERARCHY, CLASSIFICATION_LEVELS } from '@openclaw-enterprise/shared/constants.js';
import { parsePolicyContent } from './resolver.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PolicyLookup {
  findByFilter(filter: {
    scope?: PolicyScope;
    domain?: string;
    status?: string;
  }): Promise<Array<{ scope: PolicyScope; scopeId: string; content: string }>>;
}

/**
 * Validates that a policy does not expand beyond its parent scope ceiling.
 * Lower levels can restrict further but MUST NOT expand permissions.
 */
export class PolicyHierarchyValidator {
  async validate(
    scope: PolicyScope,
    scopeId: string,
    content: string,
    store: PolicyLookup,
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // Enterprise scope is the ceiling — no parent to validate against
    if (scope === 'enterprise') {
      return { valid: true, errors: [] };
    }

    const scopeIdx = POLICY_SCOPE_HIERARCHY.indexOf(scope);
    const parentScope = POLICY_SCOPE_HIERARCHY[scopeIdx - 1] as PolicyScope;

    // Find the parent policy
    const parentPolicies = await store.findByFilter({
      scope: parentScope,
      status: 'active',
    });

    if (parentPolicies.length === 0) {
      // No parent policy to validate against — allow
      return { valid: true, errors: [] };
    }

    const parentContent = parsePolicyContent(parentPolicies[0].content);
    const childContent = parsePolicyContent(content);

    // Validate each field
    for (const [key, childValue] of Object.entries(childContent)) {
      const parentValue = parentContent[key];
      if (parentValue === undefined) continue;

      // Arrays: child must be a subset of parent
      if (Array.isArray(parentValue) && Array.isArray(childValue)) {
        const extraValues = childValue.filter(
          (v) => !(parentValue as string[]).includes(v as string),
        );
        if (extraValues.length > 0) {
          errors.push(
            `Field "${key}": values [${extraValues.join(', ')}] expand beyond ${parentScope} scope. ` +
            `Allowed: [${parentValue.join(', ')}]`,
          );
        }
      }

      // Booleans: child cannot enable what parent disables
      if (typeof parentValue === 'boolean' && typeof childValue === 'boolean') {
        if (!parentValue && childValue) {
          errors.push(
            `Field "${key}": cannot enable at ${scope} scope when disabled at ${parentScope} scope`,
          );
        }
      }

      // Numbers: child cannot set a higher limit than parent
      if (typeof parentValue === 'number' && typeof childValue === 'number') {
        if (childValue > parentValue) {
          errors.push(
            `Field "${key}": value ${childValue} exceeds ${parentScope} limit of ${parentValue}`,
          );
        }
      }

      // Classification levels: child cannot set a less restrictive level
      if (
        typeof parentValue === 'string' &&
        typeof childValue === 'string' &&
        CLASSIFICATION_LEVELS.includes(parentValue as typeof CLASSIFICATION_LEVELS[number]) &&
        CLASSIFICATION_LEVELS.includes(childValue as typeof CLASSIFICATION_LEVELS[number])
      ) {
        const parentIdx = CLASSIFICATION_LEVELS.indexOf(parentValue as typeof CLASSIFICATION_LEVELS[number]);
        const childIdx = CLASSIFICATION_LEVELS.indexOf(childValue as typeof CLASSIFICATION_LEVELS[number]);
        if (childIdx > parentIdx) {
          // Higher index = more permissive for sharing
          errors.push(
            `Field "${key}": classification "${childValue}" is less restrictive than ${parentScope} level "${parentValue}"`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
