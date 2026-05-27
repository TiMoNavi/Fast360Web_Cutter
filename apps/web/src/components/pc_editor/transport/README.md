# PC Editor Transport

Home for low-level network transport used by the PC Editor frontend.

Prefer reusing `src/lib/api.ts` and shared protocol types. UI, interaction adapters, bindings, and A-Frame runtime components should not send requests directly.

Current Player V2 transport wraps:

```text
switchWebXrPlayerSession
renderTest
getExportStatus
sendViewPathPatch
sendEffectEventsPatch
sendPlaybackClientState
```

These wrappers are intentionally thin. Business validation and naming belong in `backend/`.
