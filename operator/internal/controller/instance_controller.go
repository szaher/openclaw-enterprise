package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	openclawv1 "github.com/szaher/openclaw-enterprise/operator/api/v1"
)

const (
	instanceFinalizer   = "openclaw.enterprise.io/finalizer"
	defaultGatewayImage = "ghcr.io/szaher/openclaw-enterprise/gateway:latest"
	defaultOPAImage     = "openpolicyagent/opa:1.4.2-static"
)

// OpenClawInstanceReconciler reconciles an OpenClawInstance object.
type OpenClawInstanceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=openclawinstances,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=openclawinstances/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=openclaw.enterprise.io,resources=openclawinstances/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups=core,resources=configmaps,verbs=get;list;watch;create;update;patch;delete

// Reconcile handles create/update/delete of OpenClawInstance resources.
func (r *OpenClawInstanceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Fetch the OpenClawInstance CR
	instance := &openclawv1.OpenClawInstance{}
	if err := r.Get(ctx, req.NamespacedName, instance); err != nil {
		if errors.IsNotFound(err) {
			logger.Info("OpenClawInstance resource not found; ignoring since it must be deleted")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "failed to get OpenClawInstance")
		return ctrl.Result{}, err
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(instance, instanceFinalizer) {
		controllerutil.AddFinalizer(instance, instanceFinalizer)
		if err := r.Update(ctx, instance); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Handle deletion
	if !instance.DeletionTimestamp.IsZero() {
		return r.reconcileDelete(ctx, instance)
	}

	// Reconcile the gateway Deployment
	if err := r.reconcileDeployment(ctx, instance); err != nil {
		return ctrl.Result{}, r.setCondition(ctx, instance, openclawv1.ConditionTypeDegraded, metav1.ConditionTrue,
			"DeploymentFailed", fmt.Sprintf("Failed to reconcile deployment: %v", err))
	}

	// Reconcile the Service
	if err := r.reconcileService(ctx, instance); err != nil {
		return ctrl.Result{}, r.setCondition(ctx, instance, openclawv1.ConditionTypeDegraded, metav1.ConditionTrue,
			"ServiceFailed", fmt.Sprintf("Failed to reconcile service: %v", err))
	}

	// Update status
	if err := r.updateStatus(ctx, instance); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// reconcileDelete handles cleanup when the CR is being deleted.
func (r *OpenClawInstanceReconciler) reconcileDelete(ctx context.Context, instance *openclawv1.OpenClawInstance) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("reconciling delete for OpenClawInstance", "name", instance.Name)

	// Owned resources (Deployment, Service) are garbage-collected via OwnerReferences.
	// Remove the finalizer to allow deletion to proceed.
	controllerutil.RemoveFinalizer(instance, instanceFinalizer)
	if err := r.Update(ctx, instance); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

// reconcileDeployment ensures the gateway Deployment matches the desired state.
func (r *OpenClawInstanceReconciler) reconcileDeployment(ctx context.Context, instance *openclawv1.OpenClawInstance) error {
	logger := log.FromContext(ctx)
	desired := r.desiredDeployment(instance)

	// Set the instance as the owner of the Deployment
	if err := ctrl.SetControllerReference(instance, desired, r.Scheme); err != nil {
		return fmt.Errorf("setting controller reference: %w", err)
	}

	existing := &appsv1.Deployment{}
	err := r.Get(ctx, types.NamespacedName{Name: desired.Name, Namespace: desired.Namespace}, existing)
	if errors.IsNotFound(err) {
		logger.Info("creating gateway Deployment", "name", desired.Name)
		return r.Create(ctx, desired)
	}
	if err != nil {
		return fmt.Errorf("getting existing deployment: %w", err)
	}

	// Update the existing Deployment
	existing.Spec.Replicas = desired.Spec.Replicas
	existing.Spec.Template = desired.Spec.Template
	logger.Info("updating gateway Deployment", "name", desired.Name)
	return r.Update(ctx, existing)
}

// desiredDeployment constructs the Deployment for the gateway + OPA sidecar.
func (r *OpenClawInstanceReconciler) desiredDeployment(instance *openclawv1.OpenClawInstance) *appsv1.Deployment {
	replicas := instance.Spec.Replicas
	if instance.Spec.DeploymentMode == openclawv1.DeploymentModeSingle {
		replicas = 1
	}

	labels := labelsForInstance(instance)

	// Resolve container images (CR overrides > defaults)
	gwImage := defaultGatewayImage
	sidecarImage := defaultOPAImage
	if instance.Spec.Images != nil {
		if instance.Spec.Images.Gateway != "" {
			gwImage = instance.Spec.Images.Gateway
		}
		if instance.Spec.Images.OPA != "" {
			sidecarImage = instance.Spec.Images.OPA
		}
	}

	// Determine secret key references
	pgSecretKey := instance.Spec.Storage.PostgresSecretRef.Key
	if pgSecretKey == "" {
		pgSecretKey = "connection-string"
	}
	redisSecretKey := instance.Spec.Storage.RedisSecretRef.Key
	if redisSecretKey == "" {
		redisSecretKey = "connection-string"
	}
	authSecretKey := instance.Spec.Auth.ClientSecretRef.Key
	if authSecretKey == "" {
		authSecretKey = "client-secret"
	}

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-gateway", instance.Name),
			Namespace: instance.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "gateway",
							Image: gwImage,
							Ports: []corev1.ContainerPort{
								{
									Name:          "http",
									ContainerPort: 8080,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name: "DATABASE_URL",
									ValueFrom: &corev1.EnvVarSource{
										SecretKeyRef: &corev1.SecretKeySelector{
											LocalObjectReference: corev1.LocalObjectReference{
												Name: instance.Spec.Storage.PostgresSecretRef.Name,
											},
											Key: pgSecretKey,
										},
									},
								},
								{
									Name: "REDIS_URL",
									ValueFrom: &corev1.EnvVarSource{
										SecretKeyRef: &corev1.SecretKeySelector{
											LocalObjectReference: corev1.LocalObjectReference{
												Name: instance.Spec.Storage.RedisSecretRef.Name,
											},
											Key: redisSecretKey,
										},
									},
								},
								{
									Name:  "SSO_PROVIDER",
									Value: instance.Spec.Auth.Provider,
								},
								{
									Name:  "SSO_CLIENT_ID",
									Value: instance.Spec.Auth.ClientID,
								},
								{
									Name: "SSO_CLIENT_SECRET",
									ValueFrom: &corev1.EnvVarSource{
										SecretKeyRef: &corev1.SecretKeySelector{
											LocalObjectReference: corev1.LocalObjectReference{
												Name: instance.Spec.Auth.ClientSecretRef.Name,
											},
											Key: authSecretKey,
										},
									},
								},
								{
									Name:  "OPA_URL",
									Value: "http://localhost:8181",
								},
							},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("250m"),
									corev1.ResourceMemory: resource.MustParse("256Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("1"),
									corev1.ResourceMemory: resource.MustParse("512Mi"),
								},
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/healthz",
										Port: intstr.FromInt(8080),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/readyz",
										Port: intstr.FromInt(8080),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
						},
						{
							Name:  "opa-sidecar",
							Image: sidecarImage,
							Args: []string{
								"run",
								"--server",
								"--addr=0.0.0.0:8181",
								"--log-level=info",
								"/policies",
							},
							Ports: []corev1.ContainerPort{
								{
									Name:          "opa",
									ContainerPort: 8181,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("100m"),
									corev1.ResourceMemory: resource.MustParse("128Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("500m"),
									corev1.ResourceMemory: resource.MustParse("256Mi"),
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "opa-policies",
									MountPath: "/policies",
									ReadOnly:  true,
								},
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt(8181),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       15,
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "opa-policies",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{
										Name: fmt.Sprintf("%s-opa-policies", instance.Name),
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

// reconcileService ensures the gateway Service exists and is up to date.
func (r *OpenClawInstanceReconciler) reconcileService(ctx context.Context, instance *openclawv1.OpenClawInstance) error {
	logger := log.FromContext(ctx)
	labels := labelsForInstance(instance)

	desired := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-gateway", instance.Name),
			Namespace: instance.Namespace,
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Selector: labels,
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       80,
					TargetPort: intstr.FromString("http"),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}

	if err := ctrl.SetControllerReference(instance, desired, r.Scheme); err != nil {
		return fmt.Errorf("setting controller reference on service: %w", err)
	}

	existing := &corev1.Service{}
	err := r.Get(ctx, types.NamespacedName{Name: desired.Name, Namespace: desired.Namespace}, existing)
	if errors.IsNotFound(err) {
		logger.Info("creating gateway Service", "name", desired.Name)
		return r.Create(ctx, desired)
	}
	if err != nil {
		return fmt.Errorf("getting existing service: %w", err)
	}

	// Update mutable fields
	existing.Spec.Selector = desired.Spec.Selector
	existing.Spec.Ports = desired.Spec.Ports
	logger.Info("updating gateway Service", "name", desired.Name)
	return r.Update(ctx, existing)
}

// updateStatus refreshes the status subresource of the instance.
func (r *OpenClawInstanceReconciler) updateStatus(ctx context.Context, instance *openclawv1.OpenClawInstance) error {
	// Fetch the current Deployment to get ready replicas
	deploy := &appsv1.Deployment{}
	deployName := fmt.Sprintf("%s-gateway", instance.Name)
	err := r.Get(ctx, types.NamespacedName{Name: deployName, Namespace: instance.Namespace}, deploy)
	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("getting deployment for status: %w", err)
	}

	if err == nil {
		instance.Status.ReadyReplicas = deploy.Status.ReadyReplicas
		if deploy.Status.ReadyReplicas == *deploy.Spec.Replicas {
			instance.Status.Phase = "Running"
		} else {
			instance.Status.Phase = "Progressing"
		}
	} else {
		instance.Status.ReadyReplicas = 0
		instance.Status.Phase = "Pending"
	}

	instance.Status.ObservedGeneration = instance.Generation

	return r.setCondition(ctx, instance, openclawv1.ConditionTypeReady, metav1.ConditionTrue,
		"Reconciled", "OpenClaw instance reconciled successfully")
}

// setCondition updates a status condition and persists the status subresource.
func (r *OpenClawInstanceReconciler) setCondition(ctx context.Context, instance *openclawv1.OpenClawInstance,
	condType openclawv1.ConditionType, status metav1.ConditionStatus, reason, message string) error {

	condition := metav1.Condition{
		Type:               string(condType),
		Status:             status,
		ObservedGeneration: instance.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	}

	// Replace existing condition of the same type, or append
	found := false
	for i, c := range instance.Status.Conditions {
		if c.Type == string(condType) {
			instance.Status.Conditions[i] = condition
			found = true
			break
		}
	}
	if !found {
		instance.Status.Conditions = append(instance.Status.Conditions, condition)
	}

	return r.Status().Update(ctx, instance)
}

// labelsForInstance returns the standard labels for all resources owned by an instance.
func labelsForInstance(instance *openclawv1.OpenClawInstance) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "openclaw-enterprise",
		"app.kubernetes.io/instance":   instance.Name,
		"app.kubernetes.io/managed-by": "openclaw-operator",
		"app.kubernetes.io/component":  "gateway",
	}
}

// SetupWithManager sets up the controller with the Manager.
func (r *OpenClawInstanceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&openclawv1.OpenClawInstance{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Complete(r)
}
