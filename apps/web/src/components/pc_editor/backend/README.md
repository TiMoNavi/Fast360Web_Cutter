# PC Editor Backend Bridge

Home for typed frontend adapters around backend business APIs.

This layer should expose semantic operations such as session switching, render requests, and timeline persistence. Low-level fetch details should stay in the transport layer.

Current Player V2 bridge:

```text
switchPcEditorSourceSession(sourceId)
  -> switch active WebXR player session

requestPcEditorRender({ sessionId })
  -> request backend render-test
  -> validate exportId before returning to workflow

getPcEditorExportStatus(exportId)
  -> poll export readiness/failure

persistPcEditorViewPathPatch(sessionId, patch)
  -> persist ViewPathPatch

persistPcEditorEffectEventsPatch(sessionId, patch)
  -> persist EffectEventsPatch

reportPcEditorPlaybackClientState(sessionId, state)
  -> report PlaybackClientState
```

Workflow hooks should import from this layer instead of importing `@/lib/api` directly.
Data orchestration code may also use this layer as its default persistence boundary while retaining test injection points.
