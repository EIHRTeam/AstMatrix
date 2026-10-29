export interface Artifact {
  name: string;
  sha256: string;
}
export interface Inventory {
  schemaVersion: number;
  version: string;
  commit: string;
  artifacts: Artifact[];
}
export const repository: string;
export function digest(bytes: Uint8Array): string;
export function archiveName(host: string, version: string): string;
export function installerName(host: string, version: string): string;
export function releaseVersion(root?: string): Promise<string>;
export function sourceCommit(): string;
export function verifyInventory(
  directory: string,
  info: Inventory,
  version: string,
  commit: string,
): Promise<void>;
export function writeInventory(
  directory: string,
  filename: string,
  names: string[],
  extra?: Record<string, unknown>,
): Promise<Inventory>;
