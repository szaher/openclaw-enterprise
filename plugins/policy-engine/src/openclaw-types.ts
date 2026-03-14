// OpenClaw Plugin API type definitions
// These will be replaced by actual OpenClaw types when available

export interface OpenClawPluginAPI {
  registerTool(tool: ToolRegistration): void;
  registerHook(hook: HookRegistration): void;
  registerService(service: ServiceRegistration): void;
  registerHttpRoute(route: HttpRouteRegistration): void;
  registerGatewayMethod(method: GatewayMethodRegistration): void;
  registerContextEngine(engine: ContextEngineRegistration): void;
}

export interface ToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface HookRegistration {
  event: string;
  handler: (context: Record<string, unknown>) => Promise<void>;
}

export interface ServiceRegistration {
  name: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  healthCheck: () => Promise<{ status: string }>;
}

export interface HttpRouteRegistration {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: unknown, res: unknown) => Promise<void>;
}

export interface GatewayMethodRegistration {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface ContextEngineRegistration {
  name: string;
  getContext: (query: string) => Promise<unknown>;
}
