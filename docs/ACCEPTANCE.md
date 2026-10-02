# Demo acceptance requirements

The requested deliverable is a complete project page for the frozen Map2Select
manuscript, developed outside the token-pruning research repository.

1. Present the frozen manuscript title and method accurately.
2. Show supported results for DriveLM and DriveLMM-o1, with correct token budgets,
   model, evaluation scope, and source labels.
3. Provide two continuous single-scene animations for each dataset. Each frame
   must show real Map2Select and baseline selections on the same input. Verify
   adjacency with original nuScenes next/previous sample links and timestamps.
4. Provide a working dataset and scene selector, synchronized frame scrubber,
   play/pause, previous/next frame, and selection overlays. Show scene and time,
   stop at scene boundaries, and explicitly replay from the beginning.
5. Explain map-guided feature coverage and the visual difference from the baseline.
   Compute overlap from actual token IDs.
6. Verify token ranges, geometry, same-budget counts, GIF frame counts, resource
   paths, source provenance, and historical selector/baseline parity.
7. Verify desktop and mobile rendering and actual browser interactions. Capture
   screenshots, console errors, failed requests, and responsive overflow.
8. Supply a standalone static site, reproducible media export tools, local preview
   instructions, and GitHub Pages deployment configuration for the named repo.
9. Preserve all original experiments and protected artifacts. Do not redistribute
   the confidential anonymous review ZIP or restricted package source.
10. Keep driving imagery visible with a light background overlay in the explorer,
    all animations and posters. Keep the Method section and its entry links hidden.

The original sampled-image collections were replaced after the user's continuity
correction. Demo selection traces remain separate from official evaluation
result streams. No answer generation or rescoring is needed for the clips.
