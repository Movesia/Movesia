/**
 * IPC channel constants for Unity project setup.
 */
export const UnityChannels = {
  SCAN_PROJECTS: 'unity:scan-projects',
  BROWSE_PROJECT: 'unity:browse-project',
  CHECK_RUNNING: 'unity:check-running',
  CHECK_PACKAGE: 'unity:check-package',
  INSTALL_PACKAGE: 'unity:install-package',
  CHECK_PACKAGE_UPDATE: 'unity:check-package-update',
} as const;

/** Channels the renderer can invoke (renderer → main) */
export const UNITY_SEND_CHANNELS = [
  UnityChannels.SCAN_PROJECTS,
  UnityChannels.BROWSE_PROJECT,
  UnityChannels.CHECK_RUNNING,
  UnityChannels.CHECK_PACKAGE,
  UnityChannels.INSTALL_PACKAGE,
  UnityChannels.CHECK_PACKAGE_UPDATE,
] as const;
