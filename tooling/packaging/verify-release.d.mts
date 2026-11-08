export function assembleRelease(
  payloadDirectory: string,
  installerDirectory: string,
  signedDirectory: string,
  output: string,
  version: string,
  commit: string,
): Promise<void>;
