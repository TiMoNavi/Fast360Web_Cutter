# Documentation

This directory contains both the organized project documentation and older planning/reference material.

## Current Source Of Truth

Start here:

```text
project-docs/README.md
```

`project-docs/` is the organized documentation set. It is the current baseline for:

```text
project vision
module expectations
current implementation state
shared data/API contracts
module boundaries
```

## Legacy Material

The following folders are kept as historical source material. They may contain older wording, intermediate plans, or stage records that no longer describe the intended current structure.

```text
architecture/
Older architecture notes and boundary discussions.

specs/
Earlier module specs for mobile web, WebXR, and backend.

records/
Stage records, lessons learned, and implementation notes.
```

When these documents conflict with `project-docs/`, treat `project-docs/` as the current guide, then check the code for final truth.

## Runtime And References

```text
../apps
Runnable application code.

../scripts
Development and sample preparation scripts.

../references/github
Ignored local clones of reference projects.

../storage
Ignored local runtime data, uploads, samples, and exports.
```
