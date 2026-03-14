.PHONY: build test manifests generate fmt vet docker-build docker-push docker-buildx

IMG ?= openclaw-enterprise-operator:latest
REGISTRY ?= ghcr.io/szaher/openclaw-enterprise
CONTROLLER_GEN ?= controller-gen
PLATFORMS ?= linux/amd64,linux/arm64

build:
	go build -o bin/manager ./cmd/manager/

test:
	go test ./... -coverprofile cover.out

manifests: ## Generate CRD manifests
	$(CONTROLLER_GEN) rbac:roleName=manager-role crd webhook paths="./..." output:crd:artifacts:config=config/crd

generate: ## Generate code (DeepCopy methods)
	$(CONTROLLER_GEN) object:headerFile="hack/boilerplate.go.txt" paths="./..."

fmt:
	go fmt ./...

vet:
	go vet ./...

docker-build: ## Build image for the current platform
	docker build -t $(IMG) -f config/manager/Dockerfile .

docker-push: ## Push single-arch image
	docker push $(IMG)

docker-buildx: ## Build and push multi-arch image (amd64 + arm64)
	docker buildx create --name openclaw-builder --use 2>/dev/null || docker buildx use openclaw-builder
	docker buildx build --platform $(PLATFORMS) \
		-t $(REGISTRY)/operator:latest \
		-t $(REGISTRY)/operator:$(VERSION) \
		-f config/manager/Dockerfile \
		--push .

docker-buildx-load: ## Build multi-arch image and load into local Docker (current platform only)
	docker buildx build --platform linux/$(shell go env GOARCH) \
		-t $(IMG) \
		-f config/manager/Dockerfile \
		--load .
