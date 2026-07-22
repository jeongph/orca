// Why: the build-scoped #9891 fallback decision — run this launch's renderers
// unsandboxed after repeated launch-time STATUS_BREAKPOINT crashes — is resolved
// once before app.whenReady() and then read when creating each window. A shared
// flag lets every window creator (main window and the dashboard pop-out, which
// is spawned deep in an IPC handler) honor it without threading an option
// through every call site.
let rendererSandboxFallbackActive = false

export function setRendererSandboxFallbackActive(value: boolean): void {
  rendererSandboxFallbackActive = value
}

export function isRendererSandboxFallbackActive(): boolean {
  return rendererSandboxFallbackActive
}
