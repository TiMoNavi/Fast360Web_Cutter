# PC Editor State

Home for Player V2 view state and the PC Editor runtime state pool.

This layer should hold state models that are consumed by UI and XR runtime children through parent composition, props, context, or selectors. It should not send network requests.

`runtimeStateStore.ts` contains the shared runtime state pool. It stores high-frequency values that need to be read by multiple components without sibling imports, such as crop mask pose, projected mask viewport bounds, and currently pressed keys.

Rules:

- Real runtime sources write state: A-Frame mask components, player playback adapters, keyboard/pointer/controller adapters.
- UI, preview, workflow, and debug components read snapshots or subscribe through hooks.
- Events describe actions that happened; runtime state describes the latest known value.
- The store is provided through `PcEditorRuntimeStateRoot` in Player V2. The current implementation keeps the default singleton for A-Frame compatibility, while exposing a Provider boundary for future scoped editor instances.
