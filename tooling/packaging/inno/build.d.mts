export function validatePayload(host: string, files: Map<string, Buffer>, version: string): void;
export function compilePayloadInstallers(
  iscc: string,
  host: string,
  version: string,
  payload: string,
  archive: string,
  output: string,
  execute?: (file: string, args: string[], options: { stdio: 'inherit' }) => unknown,
): Promise<string[]>;
export function checkCompilerVersion(
  iscc: string,
  execute?: (file: string, args: string[], options: { encoding: 'utf8' }) => string,
): string;
