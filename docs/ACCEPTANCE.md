# Demo acceptance requirements

The requested deliverable is a complete project page for the frozen Map2Select
manuscript, developed outside the token-pruning research repository.

1. Present the frozen manuscript title and method accurately.
2. Show supported results for DriveLM and DriveLMM-o1, with correct token budgets,
   model, evaluation scope, and source labels.
3. Provide two animated frame collections for each dataset. Each frame must show
   real Map2Select and baseline selections on the same input.
4. Provide a working dataset and collection selector, synchronized frame scrubber,
   play/pause, previous/next frame, and selection overlays.
5. Explain map-guided feature coverage and the visual difference from the baseline.
   Compute overlap from actual token IDs.
6. Verify token ranges, geometry, same-budget counts, GIF frame counts, resource
   paths, source provenance, and independent strict-baseline parity.
7. Verify desktop and mobile rendering and actual browser interactions. Capture
   screenshots, console errors, failed requests, and responsive overflow.
8. Supply a standalone static site, reproducible media export tools, local preview
   instructions, and GitHub Pages deployment configuration for the named repo.
9. Preserve all original experiments and protected artifacts. Do not redistribute
   the confidential anonymous review ZIP or restricted package source.

Animation collections are labeled as collections when they are sampled images,
not temporally contiguous driving sequences. Demo traces are separate from
official evaluation result streams.
