# fixtures

Shared regression inputs and captured runtime data:

- `core-samples.ts`: EAN-13, EAN-8, Code 128, QR, and Data Matrix requests used by conformance,
  vector, and decode tests and by the core benchmark.
- `illustrator-cep-runtime.ts`: captured Illustrator/CEP version fields, kept as strings to
  reproduce the native bridge serialization.

Constructed samples are not standards certification. Data that has not been confirmed against
the relevant standard must never be presented as "standard verified".
