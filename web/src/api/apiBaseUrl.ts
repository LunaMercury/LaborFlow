function resolveAdjacentPort(fallbackPort: number) {
  const currentPort = Number.parseInt(window.location.port, 10);

  if (!Number.isFinite(currentPort)) {
    return fallbackPort;
  }

  return currentPort + 1;
}

export function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL ??
    `${window.location.protocol}//${window.location.hostname}:${resolveAdjacentPort(5581)}`
  );
}
