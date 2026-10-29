export function validatePayload(host: string, files: Map<string, Buffer>, version: string): void;
export function checkCompilerVersion(
  iscc: string,
  execute?: (file: string, args: string[], options: { encoding: 'utf8'; input: string }) => string,
): string;
