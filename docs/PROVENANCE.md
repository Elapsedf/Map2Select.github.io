# Visual and numerical evidence

## Frozen manuscript

The manuscript title and result values were checked against the July 28, 2026
final Map2Select supplement. The manuscript SHA-256 is
`b5efbc0f20d22dabf00e5c91eb16e21e4f8149e992bc7db490f16f94b999d63a`.
The original research file `writing/main copy.tex` matches that hash. The later
`writing/main.tex` has a different brand and was not used as the page's version.

DriveLM scores come from returned official evaluator files; DriveLMM-o1 scores
use the complete 4,634-question official-format GPT-4o mini evaluation. Table
values retain their original precision in `assets/data/results.json`.

## DriveLM visualization

- Source: existing matched medium800/holdout400 development diagnostics.
- Exact selector: semantic-ratio feature coreset, marginal allocation, C9EM.
- Baseline: the saved Prune2Drive C0p comparison.
- Eligible images: 386 distinct six-camera tuples; 128 are evenly sampled.
- Per method, per image: 426 selected tokens from 4,374.
- The display is `[front-left, front, front-right; back-left, back, back-right]`.
  Model input offsets preserve `[front, front-left, front-right, back, back-left,
  back-right]`, rather than the display order.

These examples are development traces. They do not claim to replay the entire
official-test artifact used for the result table.

## DriveLMM-o1 visualization

- Exact decisions match both the original prediction stream and final frozen
  decision store. The full store covers 4,634 questions and 539 distinct images.
- The demo uses the first 128 distinct image references in official question
  order, with the corresponding canonical question for each image.
- Strict baseline: original decoder prefill hook, `fastv_k=1`, bf16 eager
  attention, original driving model revision
  `b3a76fe56fdebc858023e45b15dbbe9e007db983`.
- Trace execution stops immediately after selection. No generated answers,
  judge calls, submissions, or new benchmark scores are produced.
- A canonical 25-token ordered trace matches an independent historical July 15
  strict trace exactly. Peak GPU memory was 15.715 GiB on an RTX 4090.
- Both methods retain 25 / 256 tokens (9.765625%). The 16 × 16 grid spans the
  whole official stitched image. It is not a separate 16 × 16 grid per camera.
- The official stitched display has `[front-left, front, front-right;
  back-right, back, back-left]`. It is preserved directly, without swapping views.

The baseline traces were exported for visualization and are separate from the
historical answer and scoring artifacts. Map2Select is scene-based; an associated
question does not condition its coreset selector.

## Independent checks

An independent review compared all 128 DriveLM retained sets for both methods
against their original masks. It also compared all 128 DriveLMM-o1 exact sets
against both the frozen NPY and original prediction stream, and every baseline
set against the newly recorded strict traces. Eight samples per benchmark were
checked against the actual source camera images and stitched pixels.

All four GIFs and all four animated WebPs have 64 distinct annotated frames.
`assets/data/media-audit.json` records clip sizes, checksums, and retained counts;
`assets/data/media-provenance.json` records source references. Selection downloads
include the actual token IDs rather than approximate box annotations.

The page validator covers the delivered data, and browser acceptance covers real
rendering and interactions. The research repository, official reference scripts,
protected strict artifact, and submission artifacts were kept unchanged.
