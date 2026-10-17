# host-integration — explicit placeholder

Real host tests belong here: insertion, selection, recolouring, path editing, undo, save,
reopen, metadata read-back, and performance in Illustrator, Photoshop, Figma, and Affinity.
The Figma first-version checklist covers insertion only and is documented in
`apps/figma-plugin/README.md`; selected-parameter recovery and updates are outside that target.

There are no cases yet. A green unit or compatibility test run never substitutes for real
Adobe/Figma/Affinity host acceptance. The Vitest `host-integration` project is the only project that
allows an empty run, so the placeholder cannot silently count as release coverage.
