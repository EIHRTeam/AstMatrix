# compatibility

Local contract tests for the host-facing layers:

- CEP bootstrap profile selection and native version fields.
- CEP transport chunking, strict JSON, cancellation, and cleanup.
- Illustrator renderer metadata, geometry validation, and rollback behavior.
- Photoshop adapter history, DPI conversion, fill topology, metadata, and cancellation.
- Photoshop local WebView version checks and message-bridge handshake.
- Host manifests and their compatibility floors.

These tests use mocks and captured native inputs. They are not real-host records. A real-host
run must separately record the full host version, CEP/UXP/SDK version, OS and architecture,
plugin build version, Web Profile, and result. Platform checks cover path separators, filename
case, Unicode, fonts, colour space, DPI, physical size, lifecycle, save/reopen, and offline
behavior.
