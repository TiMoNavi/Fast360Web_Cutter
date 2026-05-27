# PC Editor Workflows

Placeholder home for event subscribers that turn `PcEditorEventBus` events into product behavior.

Examples:

```text
usePlayerWorkflow
useViewportWorkflow
useTimelineWorkflow
useEffectsWorkflow
```

UI, keyboard, and A-Frame components should not call workflow internals directly. They should emit events and let workflow hooks subscribe inside the composition root.
