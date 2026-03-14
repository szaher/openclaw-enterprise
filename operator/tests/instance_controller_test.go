package tests

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	openclawv1 "github.com/szaher/openclaw-enterprise/operator/api/v1"
	"github.com/szaher/openclaw-enterprise/operator/internal/controller"
)

func newTestScheme() *runtime.Scheme {
	s := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(s)
	_ = openclawv1.AddToScheme(s)
	_ = appsv1.AddToScheme(s)
	return s
}

func newTestInstance(name, namespace string, mode openclawv1.DeploymentMode, replicas int32) *openclawv1.OpenClawInstance {
	return &openclawv1.OpenClawInstance{
		ObjectMeta: metav1.ObjectMeta{
			Name:       name,
			Namespace:  namespace,
			Generation: 1,
		},
		Spec: openclawv1.OpenClawInstanceSpec{
			DeploymentMode: mode,
			Replicas:       replicas,
			Auth: openclawv1.AuthConfig{
				Provider: "okta",
				ClientID: "test-client-id",
				ClientSecretRef: openclawv1.SecretReference{
					Name: "sso-secret",
					Key:  "client-secret",
				},
			},
			Storage: openclawv1.StorageConfig{
				PostgresSecretRef: openclawv1.SecretReference{
					Name: "pg-secret",
					Key:  "connection-string",
				},
				RedisSecretRef: openclawv1.SecretReference{
					Name: "redis-secret",
					Key:  "connection-string",
				},
			},
			Integrations: []openclawv1.IntegrationConfig{
				{Type: "gmail", Enabled: true},
				{Type: "jira", Enabled: true, Config: map[string]string{"baseUrl": "https://test.atlassian.net"}},
			},
		},
	}
}

func TestInstanceReconcile_CreatesDeployment(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("test-instance", "default", openclawv1.DeploymentModeHA, 3)

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "test-instance",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	// Verify Deployment was created
	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "test-instance-gateway",
		Namespace: "default",
	}, deploy)
	if err != nil {
		t.Fatalf("expected deployment to be created: %v", err)
	}

	if *deploy.Spec.Replicas != 3 {
		t.Errorf("expected 3 replicas, got %d", *deploy.Spec.Replicas)
	}

	// Verify gateway and OPA sidecar containers
	containers := deploy.Spec.Template.Spec.Containers
	if len(containers) != 2 {
		t.Fatalf("expected 2 containers (gateway + opa-sidecar), got %d", len(containers))
	}

	if containers[0].Name != "gateway" {
		t.Errorf("expected first container to be 'gateway', got %q", containers[0].Name)
	}
	if containers[1].Name != "opa-sidecar" {
		t.Errorf("expected second container to be 'opa-sidecar', got %q", containers[1].Name)
	}
}

func TestInstanceReconcile_SingleModeForcesSingleReplica(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("single-instance", "default", openclawv1.DeploymentModeSingle, 5)

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "single-instance",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "single-instance-gateway",
		Namespace: "default",
	}, deploy)
	if err != nil {
		t.Fatalf("expected deployment to be created: %v", err)
	}

	if *deploy.Spec.Replicas != 1 {
		t.Errorf("single mode should force 1 replica, got %d", *deploy.Spec.Replicas)
	}
}

func TestInstanceReconcile_CreatesService(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("svc-instance", "default", openclawv1.DeploymentModeHA, 2)

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "svc-instance",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	svc := &corev1.Service{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "svc-instance-gateway",
		Namespace: "default",
	}, svc)
	if err != nil {
		t.Fatalf("expected service to be created: %v", err)
	}

	if svc.Spec.Type != corev1.ServiceTypeClusterIP {
		t.Errorf("expected ClusterIP service, got %v", svc.Spec.Type)
	}

	if len(svc.Spec.Ports) != 1 || svc.Spec.Ports[0].Port != 80 {
		t.Errorf("expected port 80, got %v", svc.Spec.Ports)
	}
}

func TestInstanceReconcile_ConfiguresStorageSecrets(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("secrets-instance", "default", openclawv1.DeploymentModeHA, 1)

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "secrets-instance",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "secrets-instance-gateway",
		Namespace: "default",
	}, deploy)
	if err != nil {
		t.Fatalf("expected deployment to be created: %v", err)
	}

	// Check that environment variables reference the correct secrets
	gatewayContainer := deploy.Spec.Template.Spec.Containers[0]
	envMap := make(map[string]corev1.EnvVar)
	for _, env := range gatewayContainer.Env {
		envMap[env.Name] = env
	}

	if dbEnv, ok := envMap["DATABASE_URL"]; !ok {
		t.Error("expected DATABASE_URL env var")
	} else if dbEnv.ValueFrom.SecretKeyRef.Name != "pg-secret" {
		t.Errorf("expected pg-secret, got %s", dbEnv.ValueFrom.SecretKeyRef.Name)
	}

	if redisEnv, ok := envMap["REDIS_URL"]; !ok {
		t.Error("expected REDIS_URL env var")
	} else if redisEnv.ValueFrom.SecretKeyRef.Name != "redis-secret" {
		t.Errorf("expected redis-secret, got %s", redisEnv.ValueFrom.SecretKeyRef.Name)
	}

	if ssoEnv, ok := envMap["SSO_CLIENT_SECRET"]; !ok {
		t.Error("expected SSO_CLIENT_SECRET env var")
	} else if ssoEnv.ValueFrom.SecretKeyRef.Name != "sso-secret" {
		t.Errorf("expected sso-secret, got %s", ssoEnv.ValueFrom.SecretKeyRef.Name)
	}
}

func TestInstanceReconcile_UpdatesReplicaCount(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("scale-instance", "default", openclawv1.DeploymentModeHA, 2)

	// Pre-create a deployment with 1 replica
	var existingReplicas int32 = 1
	existingDeploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "scale-instance-gateway",
			Namespace: "default",
			Labels: map[string]string{
				"app.kubernetes.io/name":       "openclaw-enterprise",
				"app.kubernetes.io/instance":   "scale-instance",
				"app.kubernetes.io/managed-by": "openclaw-operator",
				"app.kubernetes.io/component":  "gateway",
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &existingReplicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app.kubernetes.io/name":     "openclaw-enterprise",
					"app.kubernetes.io/instance": "scale-instance",
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app.kubernetes.io/name":     "openclaw-enterprise",
						"app.kubernetes.io/instance": "scale-instance",
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{Name: "gateway", Image: "old-image"},
					},
				},
			},
		},
	}

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance, existingDeploy).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "scale-instance",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "scale-instance-gateway",
		Namespace: "default",
	}, deploy)
	if err != nil {
		t.Fatalf("expected deployment: %v", err)
	}

	if *deploy.Spec.Replicas != 2 {
		t.Errorf("expected replicas to be updated to 2, got %d", *deploy.Spec.Replicas)
	}
}

func TestInstanceReconcile_NotFoundIgnored(t *testing.T) {
	scheme := newTestScheme()

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
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

func TestInstanceReconcile_OPASidecarPresent(t *testing.T) {
	scheme := newTestScheme()
	instance := newTestInstance("opa-test", "default", openclawv1.DeploymentModeHA, 1)

	client := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	reconciler := &controller.OpenClawInstanceReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "opa-test",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("reconcile failed: %v", err)
	}

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{
		Name:      "opa-test-gateway",
		Namespace: "default",
	}, deploy)
	if err != nil {
		t.Fatalf("expected deployment: %v", err)
	}

	// Find OPA sidecar
	var opaContainer *corev1.Container
	for i := range deploy.Spec.Template.Spec.Containers {
		if deploy.Spec.Template.Spec.Containers[i].Name == "opa-sidecar" {
			opaContainer = &deploy.Spec.Template.Spec.Containers[i]
			break
		}
	}

	if opaContainer == nil {
		t.Fatal("expected opa-sidecar container")
	}

	// Verify OPA port
	if len(opaContainer.Ports) != 1 || opaContainer.Ports[0].ContainerPort != 8181 {
		t.Errorf("expected OPA port 8181, got %v", opaContainer.Ports)
	}

	// Verify OPA volume mount
	if len(opaContainer.VolumeMounts) != 1 || opaContainer.VolumeMounts[0].MountPath != "/policies" {
		t.Errorf("expected /policies mount, got %v", opaContainer.VolumeMounts)
	}
}
