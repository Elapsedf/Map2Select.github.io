# Visual and numerical evidence

## Frozen manuscript

The manuscript title and result values were checked against the July 28, 2026
final Map2Select supplement. The manuscript SHA-256 is
`b5efbc0f20d22dabf00e5c91eb16e21e4f8149e992bc7db490f16f94b999d63a`.
The original research file `writing/main copy.tex` matches that hash. The later
`writing/main.tex` uses a different brand.

DriveLM scores come from returned official evaluator files; DriveLMM-o1 scores
use the complete 4,634-question official-format GPT-4o mini evaluation. Table
values retain their original precision in `assets/data/results.json`.

## Continuous scene policy

Each of the four animations follows consecutive nuScenes keyframes from one
scene. Frame order is verified against the source `sample.next` / `sample.prev`
links, scene tokens and microsecond timestamps. The explorer shows elapsed
source time and the native approximately 2 Hz sampling rate. It pauses at the
final frame. A looping GIF repeats the same scene from the start.

No images or token selections are interpolated. Benchmark question sets contain
sparse snapshots, so long continuous scenes require newly exported selections
on neighboring source keyframes. These are isolated visualization diagnostics,
separate from official answer generation, judges and benchmark scores.

The initial website sampled independent benchmark images into collections. The
current continuous scenes replace those collections after the user's correction.
All original research and scoring artifacts are preserved.

## DriveLM visualization

- Selector: exact semantic-ratio feature coreset with marginal view allocation,
  matching the C9EM configuration.
- Baseline: Prune2Drive using the C0p configuration.
- Per method, per image: 426 selected tokens from 4,374.
- New traces are checked against historical matched development masks before
  exporting the continuous scenes.
- The display is `[front-left, front, front-right; back-left, back, back-right]`.
  Model input offsets preserve `[front, front-left, front-right, back, back-left,
  back-right]`.
- Each sequence uses the same question across frames, recorded in its trace
  provenance. No answers are generated.

The result table separately reports the 15,480-question official test.

## DriveLMM-o1 visualization

- Selector: exact semantic-ratio feature coreset with marginal allocation,
  checked against the final frozen decision store on historical anchor images.
- Strict baseline: original decoder prefill hook, `fastv_k=1`, bf16 eager
  attention, original driving model revision
  `b3a76fe56fdebc858023e45b15dbbe9e007db983`.
- Historical ordered strict selections provide a parity check before the
  continuous-scene export.
- Both methods retain 25 / 256 tokens (9.765625%). The 16 × 16 grid spans the
  whole stitched image.
- Stitch order is `[front-left, front, front-right; back-right, back, back-left]`,
  preserving the original official input geometry.
- Neighboring frames have new real selections from the same selector
  configuration. The frozen benchmark store alone cannot select new images.
- Trace execution stops after selection. No generated answers, judge calls,
  submissions or new benchmark scores are produced.

The result table separately reports the full 4,634-question evaluation.

## Delivered evidence and appearance

`assets/data/media-provenance.json` records scene and trace sources, configurations
and historical parity evidence. Each frame includes its source sample links and
timestamp. Selection downloads contain the actual retained token IDs.

`assets/data/media-audit.json` records original-index comparisons and checksums
for every clip, poster and selection download. The validator checks all token
budgets, geometry, source adjacency and published checksums. Browser acceptance
checks actual rendering, timestamps, scene boundaries, controls and downloads.

Interactive canvases, posters and animations use a light approximately 14%
shade to keep unselected driving context visible. Token borders carry the
comparison. Source images and retained IDs are unchanged by rendering.

The Method section and its entry links are hidden at the user's request.
The research repository, official reference scripts, protected strict artifact
and submission artifacts remain unchanged.
