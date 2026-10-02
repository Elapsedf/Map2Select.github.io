# Map2Select project demo

An interactive static project page for **Map2Select: A Training-Free HD-Map
Plug-In for Visual Token Selection in Driving VLMs**. It follows the frozen
July 2026 manuscript and its supported results.

## Preview

The page runs without a model, GPU, backend, or build step:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Open <http://localhost:8765>. Use an HTTP server; opening `index.html` with
`file://` does not allow the browser to fetch the local JSON data reliably.

## What is included

- DriveLM and DriveLMM-o1, with two continuous single-scene sequences each,
  40 / 40 / 40 / 41 consecutive keyframes: 161 real frames in total.
- Four paired GIFs, four smaller animated WebP previews, posters, and source frames.
- Dataset and scene switching, synchronized frame scrubbing, playback,
  previous/next, keyboard shortcuts, and selected/original/difference views.
- Token hover, grid and opacity controls, overlap statistics, and camera budget bars.
- Supported 10% and 25% benchmark results and citation. The Method section and
  its entry links are temporarily hidden at the user's request.
- A responsive mobile layout, motion preferences, and a JavaScript-free clip gallery.
- Downloadable retained token IDs and per-frame provenance.

The website replays saved real decisions. Each animation follows the original
nuScenes `sample.next` / `sample.prev` chain within one scene, with no skipped or
interpolated keyframes. Native keyframes are sampled at approximately 2 Hz;
the explorer shows the original relative timestamps and pauses at the end.
GIFs repeat the same scene when they loop. The driving context stays visible
under a light 14% overlay; colored borders identify retained tokens.

## Evidence

Continuous clips use new isolated visualization traces, preserving the final
selector configurations and model inputs. They are separate from answer
generation and benchmark scoring. The earlier version sampled independent
benchmark images across scenes; it was replaced after the user identified the
scene changes.

DriveLM compares exact Map2Select with Prune2Drive at 426 / 4,374 tokens. Historical
matched development masks provide selection parity anchors. The result table
separately reports the 15,480-question official test.

DriveLMM-o1 compares exact Map2Select with the strict Prune2Drive prefill hook at
25 / 256 tokens. Historical frozen decisions and strict traces provide parity
anchors. Continuous scenes include newly exported decisions on neighboring
keyframes; they are not restricted to the frozen benchmark's sparse images.

See [provenance](docs/PROVENANCE.md), [acceptance requirements](docs/ACCEPTANCE.md),
and `assets/data/media-audit.json`. Visual comparisons illustrate selection
behavior; they do not establish a causal answer-quality or safety improvement.
The DriveLMM-o1 paired confidence intervals include zero.

The confidential anonymous review archive and production selector implementation
are not distributed by this demo. No public paper PDF or acceptance status was
verified, so the resources link to this project and the actual downloadable data.

## Validation

```sh
python -m pip install Pillow
python tools/validate_site.py
```

The validator checks every image geometry and token set, same-budget counts,
single-scene source links, timestamps, all four GIFs, resource paths, and
supported result values.

For browser acceptance, install Playwright separately and use a system Chrome:

```sh
npm install --prefix /tmp/map2select-browser playwright
MAP2SELECT_PLAYWRIGHT=/tmp/map2select-browser/node_modules/playwright \
  node tools/browser_qa.cjs http://127.0.0.1:8765/
```

Set `MAP2SELECT_CHROME` if Chrome is not at `/opt/google/chrome/chrome`.
The browser audit verifies visible output, real interactions, downloads, and
mobile layout. Screenshots and its JSON report are written to `qa/`.

Animations can be re-rendered from the bundled images and actual retained IDs:

```sh
python tools/render_clips.py --dataset drivelmm --sequence collection-1 \
  --output /tmp/map2select-rendered
```

This export needs only Pillow and writes to the specified directory. It does
not recompute selections or load the research model.

## GitHub Pages

Destination repository: <https://github.com/Elapsedf/Map2Select.github.io>.
The included workflow validates and publishes only `index.html`, `.nojekyll`,
and `assets/`. It attempts to enable Pages using the workflow's permissions.
If repository settings prevent automatic enablement, choose **GitHub Actions**
in **Settings → Pages**. A push to `main` then deploys the project page.

The expected project URL is <https://elapsedf.github.io/Map2Select.github.io/>.
The repository name does not create a separate `map2select.github.io` domain.
All asset URLs are relative and support the project URL's path prefix.

## Credits

Scenes are from [nuScenes](https://www.nuscenes.org/) (Caesar et al., CVPR 2020),
modified for research visualization. Original imagery remains subject to the
[dataset terms](https://www.nuscenes.org/terms-of-use). Token overlays and
animations were produced for Map2Select. Do not treat the dataset imagery as
an unrestricted asset collection.

The presentation was informed by the clear research and visual browsing patterns
of [Nerfies](https://nerfies.github.io/) and
[Dynamic 3D Gaussians](https://dynamic3dgaussians.github.io/); the page code and
design were created for this project.
