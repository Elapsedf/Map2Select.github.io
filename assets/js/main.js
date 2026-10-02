/* Map2Select's static explorer renders saved selections; it never generates token IDs. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = { baseline: '#e9ae67', ours: '#69d9b2', shared: '#c4d0bd' };
  const state = { datasets: [], dataset: null, sequence: null, frame: 0, budget: null, view: 'selected', opacity: .45, grid: false, image: null, selection: null, hovered: null, playing: false, playTimer: null, generation: 0, gallery: 'all' };
  const imageCache = new Map();
  const elements = {
    explorer: $('#token-explorer'), tabs: $('#dataset-tabs'), sequence: $('#sequence-select'), budget: $('#budget-select'), slider: $('#frame-slider'), counter: $('#frame-counter'), play: $('#play-button'), previous: $('#previous-frame'), next: $('#next-frame'), status: $('#data-status'), gallery: $('#clip-gallery'), canvas: { baseline: $('#baseline-canvas'), ours: $('#ours-canvas') }
  };
  const safeURL = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const u = new URL(value, location.href); return ['http:', 'https:', 'file:'].includes(u.protocol) ? value : null; } catch { return null; }
  };
  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const getFrame = () => state.sequence?.frames[state.frame];
  const cameraCells = frame => frame.cameras.reduce((sum, c) => sum + c.rows * c.cols, 0);
  const number = value => new Intl.NumberFormat('en-US').format(value);
  function setStatus(message, retry = false) {
    elements.status.replaceChildren();
    if (!message) return;
    elements.status.append(document.createTextNode(message));
    if (retry) { const button = node('button', '', 'Try again'); button.addEventListener('click', () => loadDemo()); elements.status.append(button); }
  }
  function validateData(data) {
    if (!Array.isArray(data.datasets) || !data.datasets.length) throw new Error('No frame collections were found in the demo data.');
    data.datasets.forEach(dataset => {
      if (!dataset.id || !Array.isArray(dataset.sequences) || !dataset.sequences.length) throw new Error('A benchmark is missing its frame collections.');
      if (!Array.isArray(dataset.budgets) || !dataset.budgets.length) throw new Error(`${dataset.label} is missing its token budget.`);
      dataset.sequences.forEach(sequence => {
        if (!Array.isArray(sequence.frames) || !sequence.frames.length) throw new Error(`${sequence.title} has no frames.`);
        sequence.frames.forEach(frame => {
          if (!safeURL(frame.image) || !(frame.width > 0 && frame.height > 0)) throw new Error(`Frame ${frame.id} is missing its source image or dimensions.`);
          if (!Array.isArray(frame.cameras) || !frame.cameras.length) throw new Error(`Frame ${frame.id} is missing its camera grid.`);
          const allIndices = new Set();
          frame.cameras.forEach(camera => {
            if (!(Number.isInteger(camera.rows) && camera.rows > 0 && Number.isInteger(camera.cols) && camera.cols > 0 && Number.isInteger(camera.indexOffset) && camera.indexOffset >= 0 && camera.width > 0 && camera.height > 0 && camera.x >= 0 && camera.y >= 0 && camera.x + camera.width <= frame.width + 1 && camera.y + camera.height <= frame.height + 1)) throw new Error(`Frame ${frame.id} has an invalid camera grid.`);
            for (let i = camera.indexOffset; i < camera.indexOffset + camera.rows * camera.cols; i++) { if (allIndices.has(i)) throw new Error(`Frame ${frame.id} has overlapping token index spaces.`); allIndices.add(i); }
          });
          dataset.budgets.forEach(budget => {
            const selection = frame.selection?.[budget.id];
            for (const method of ['baseline', 'ours']) {
              const indices = selection?.[method]?.indices;
              if (!Array.isArray(indices) || !indices.length || indices.some(i => !Number.isInteger(i) || !allIndices.has(i)) || new Set(indices).size !== indices.length) throw new Error(`Frame ${frame.id} is missing valid saved ${method} token IDs for ${budget.label}.`);
            }
          });
        });
      });
    });
    return data.datasets;
  }
  function imageFor(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => { imageCache.delete(url); reject(new Error('This frame image could not be loaded.')); }; img.src = url; });
    imageCache.set(url, promise);
    if (imageCache.size > 18) imageCache.delete(imageCache.keys().next().value);
    return promise;
  }
  function setBusy(busy, message = 'Loading annotated frames…') {
    elements.explorer.setAttribute('aria-busy', String(busy));
    for (const method of ['baseline', 'ours']) {
      const placeholder = $(`#${method}-placeholder`);
      placeholder.hidden = !busy;
      $('span', placeholder).textContent = message;
    }
  }
  function selectionStats(selection) {
    const baseline = new Set(selection.baseline.indices), ours = new Set(selection.ours.indices);
    const shared = new Set([...ours].filter(i => baseline.has(i)));
    return { baseline, ours, shared, oursOnly: ours.size - shared.size, baselineOnly: baseline.size - shared.size };
  }
  function activateDataset(id, preservePlay = false) {
    if (!preservePlay) stopPlayback();
    state.dataset = state.datasets.find(ds => ds.id === id) || state.datasets[0];
    state.sequence = state.dataset.sequences[0]; state.frame = 0; state.budget = state.dataset.budgets[0].id;
    $$('#dataset-tabs button').forEach(button => { const selected = button.dataset.dataset === state.dataset.id; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    $('#model-label').textContent = state.dataset.id === 'drivelmm' ? 'InternVL2.5-8B' : state.dataset.model || 'Saved frame-level selections';
    elements.sequence.replaceChildren(...state.dataset.sequences.map(sequence => { const option = node('option', '', sequence.title); option.value = sequence.id; return option; }));
    elements.sequence.value = state.sequence.id; elements.sequence.disabled = false;
    elements.budget.replaceChildren(...state.dataset.budgets.map(budget => { const option = node('option', '', budget.label); option.value = budget.id; return option; }));
    elements.budget.value = state.budget; elements.budget.disabled = state.dataset.budgets.length === 1;
    syncTimeline(); renderFrame();
  }
  function syncTimeline() {
    const max = state.sequence.frames.length - 1;
    elements.slider.max = max; elements.slider.value = state.frame; elements.slider.disabled = max === 0;
    elements.counter.textContent = `${String(state.frame + 1).padStart(2, '0')} / ${number(max + 1)}`;
    elements.play.disabled = max === 0; elements.previous.disabled = max === 0; elements.next.disabled = max === 0;
    elements.slider.setAttribute('aria-valuetext', `Frame ${state.frame + 1} of ${max + 1}: ${getFrame().id}`);
  }
  function selectFrame(index) {
    if (!state.sequence) return;
    state.frame = (index + state.sequence.frames.length) % state.sequence.frames.length;
    syncTimeline(); renderFrame();
  }
  function updateFrameText(frame, selection, stats) {
    const total = cameraCells(frame), fraction = stats.ours.size / total * 100;
    $('#baseline-label').textContent = selection.baseline.label || selection.baseline.method || 'Baseline';
    $('#ours-label').textContent = selection.ours.label || 'Map2Select';
    $('#baseline-count').textContent = `${number(stats.baseline.size)} / ${number(total)} TOKENS`;
    $('#ours-count').textContent = `${number(stats.ours.size)} / ${number(total)} TOKENS`;
    $('#retained-stat').textContent = `${fraction.toFixed(2)}%`;
    $('#shared-stat').textContent = `${number(stats.shared.size)}`;
    $('#unique-stat').textContent = `${number(stats.oursOnly)}`;
    const source = frame.source || state.sequence.source || state.dataset.source || frame.id;
    const friendlySource = state.dataset.id === 'drivelm' ? 'Recorded DriveLM held-out dev frame · 6 camera views' : state.dataset.id === 'drivelmm' ? 'Recorded DriveLMM-o1 benchmark frame · 16 × 16 visual grid' : typeof source === 'object' ? source.label || source.path || frame.id : source;
    $('#frame-source').textContent = friendlySource;
    $('#frame-source').title = frame.id;
    const note = state.dataset.id === 'drivelm' ? 'Saved selections from a matched 400-question held-out dev split. The results table uses official test scores.' : state.dataset.id === 'drivelmm' ? 'Frozen exact selections with a replayed strict decoder prefill selection trace. The results table uses full-test scores.' : state.sequence.protocol || state.dataset.protocol || '';
    $('#selection-note').textContent = `The overlay shows visual patch tokens, not object detections. ${note}`;
    const insight = frame.note || state.sequence.explanation || state.dataset.explanation;
    $('#frame-insight').hidden = !insight;
    $('#frame-insight-text').textContent = insight || '';
    const description = `${state.dataset.label}, ${state.sequence.title}, frame ${state.frame + 1} of ${state.sequence.frames.length}. ${stats.shared.size} shared tokens; ${stats.oursOnly} tokens retained only by Map2Select.`;
    elements.canvas.baseline.setAttribute('aria-label', `${description} ${selection.baseline.label || selection.baseline.method} retains ${stats.baseline.size} of ${total} visual tokens.`);
    elements.canvas.ours.setAttribute('aria-label', `${description} Map2Select retains ${stats.ours.size} of ${total} visual tokens.`);
    const allocations = $('#camera-allocation'); allocations.replaceChildren(); $('#allocation-details').hidden = frame.cameras.length < 2;
    const allocationCounts = frame.cameras.map(camera => { const lower = camera.indexOffset, upper = lower + camera.rows * camera.cols; return { camera, baseline: [...stats.baseline].filter(i => i >= lower && i < upper).length, ours: [...stats.ours].filter(i => i >= lower && i < upper).length }; });
    const maxCount = Math.max(...allocationCounts.flatMap(a => [a.baseline, a.ours]));
    allocationCounts.forEach(allocation => { const item = node('div', 'camera-budget'); item.append(node('span', 'camera-budget-name', allocation.camera.label)); for (const method of ['baseline', 'ours']) { const bar = node('div', `camera-budget-bar ${method}-bar`), fill = node('i'); fill.style.width = `${allocation[method] / maxCount * 100}%`; fill.setAttribute('aria-hidden', 'true'); bar.setAttribute('aria-label', `${allocation.camera.label}, ${method === 'ours' ? 'Map2Select' : 'Baseline'}: ${allocation[method]} tokens`); bar.append(fill, node('span', '', String(allocation[method]))); item.append(bar); } allocations.append(item); });
    const equalBaseline = new Set(allocationCounts.map(a => a.baseline)).size === 1;
    $('.allocation-intro').textContent = `${equalBaseline ? 'The baseline uses an equal per-view budget.' : 'The bars show the recorded allocation for each method.'} Map2Select allocates tokens by the marginal gain in weighted feature coverage. Amber: baseline. Teal: Map2Select.`;
  }
  async function renderFrame() {
    const generation = ++state.generation;
    const frame = getFrame(); if (!frame) return;
    state.hovered = null; hideTooltips();
    const selection = frame.selection[state.budget];
    state.selection = selection;
    const stats = selectionStats(selection);
    updateFrameText(frame, selection, stats);
    setBusy(true); setStatus('');
    try {
      const img = await imageFor(frame.image);
      if (generation !== state.generation) return;
      state.image = img;
      if (img.naturalWidth !== frame.width || img.naturalHeight !== frame.height) throw new Error('The source image dimensions do not match the recorded token grid.');
      for (const canvas of Object.values(elements.canvas)) canvas.parentElement.style.aspectRatio = `${frame.width} / ${frame.height}`;
      drawAll(); setBusy(false);
      const next = state.sequence.frames[(state.frame + 1) % state.sequence.frames.length];
      imageFor(next.image).catch(() => {});
      if (state.playing) scheduleNext();
    } catch (error) {
      if (generation !== state.generation) return;
      stopPlayback(); setBusy(true, 'Frame unavailable');
      $('.loading-orbit', $('#baseline-placeholder')).hidden = true; $('.loading-orbit', $('#ours-placeholder')).hidden = true;
      setStatus(`${error.message} Choose another frame or try again.`, true);
    }
  }
  function visitCells(frame, callback) {
    frame.cameras.forEach(camera => {
      const width = camera.width / camera.cols, height = camera.height / camera.rows;
      for (let row = 0; row < camera.rows; row++) for (let col = 0; col < camera.cols; col++) callback(camera.indexOffset + row * camera.cols + col, camera.x + col * width, camera.y + row * height, width, height, camera, row, col);
    });
  }
  function drawAll() {
    if (!state.image || !state.selection || !getFrame()) return;
    const frame = getFrame(), stats = selectionStats(state.selection);
    for (const method of ['baseline', 'ours']) drawCanvas(elements.canvas[method], method, frame, stats);
    updateLegend();
  }
  function drawCanvas(canvas, method, frame, stats) {
    const cssWidth = canvas.parentElement.getBoundingClientRect().width;
    const scale = Math.min(2, window.devicePixelRatio || 1) * cssWidth / frame.width;
    canvas.width = Math.max(1, Math.round(frame.width * scale)); canvas.height = Math.max(1, Math.round(frame.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / frame.width, 0, 0, canvas.height / frame.height, 0, 0);
    ctx.drawImage(state.image, 0, 0, frame.width, frame.height);
    if (state.view !== 'raw') {
      ctx.fillStyle = `rgba(8,22,17,${Math.min(.79, .37 + state.opacity * .53)})`; frame.cameras.forEach(camera => ctx.fillRect(camera.x, camera.y, camera.width, camera.height));
      visitCells(frame, (index, x, y, w, h) => {
        if (!stats[method].has(index)) return;
        ctx.drawImage(state.image, x, y, w, h, x, y, w, h);
        ctx.globalAlpha = state.opacity * .55;
        ctx.fillStyle = state.view === 'difference' && stats.shared.has(index) ? colors.shared : colors[method];
        ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
        ctx.strokeStyle = state.view === 'difference' && stats.shared.has(index) ? '#c4d0bd99' : method === 'baseline' ? '#edbd7fc9' : '#77ddbccc';
        ctx.lineWidth = Math.max(.7, frame.width / cssWidth * .6); ctx.strokeRect(x + .45, y + .45, w - .9, h - .9);
      });
    }
    if (state.grid) {
      ctx.strokeStyle = '#e6ede43d'; ctx.lineWidth = Math.max(.65, frame.width / cssWidth * .4);
      frame.cameras.forEach(camera => {
        ctx.beginPath();
        for (let col = 0; col <= camera.cols; col++) { const x = camera.x + camera.width * col / camera.cols; ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + camera.height); }
        for (let row = 0; row <= camera.rows; row++) { const y = camera.y + camera.height * row / camera.rows; ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + camera.width, y); }
        ctx.stroke();
      });
    }
    if (state.hovered !== null) visitCells(frame, (index, x, y, w, h) => { if (index === state.hovered) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.4, frame.width / cssWidth * 1.4); ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); } });
  }
  function updateLegend() {
    const legend = $('#view-explanation');
    legend.replaceChildren();
    if (state.view === 'raw') { legend.textContent = 'Original input image. Token overlays are hidden.'; return; }
    if (state.view === 'difference') {
      [['#c4d0bd', 'Shared'], [colors.baseline, 'Baseline only'], [colors.ours, 'Map2Select only']].forEach(([color, text], i) => { const swatch = node('i', 'legend-swatch'); swatch.style.background = color; swatch.setAttribute('aria-hidden', 'true'); if (i) legend.append(document.createTextNode(' · ')); legend.append(swatch, document.createTextNode(text)); });
    } else { const swatch = node('i', 'legend-swatch selected-swatch'); swatch.setAttribute('aria-hidden', 'true'); legend.append(swatch, document.createTextNode('Colored cells are retained visual tokens.')); }
  }
  function hitToken(event, canvas) {
    const frame = getFrame(); if (!frame || !state.image) return null;
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * frame.width, y = (event.clientY - rect.top) / rect.height * frame.height;
    const camera = frame.cameras.find(c => x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height);
    if (!camera) return null;
    const col = Math.floor((x - camera.x) / camera.width * camera.cols), row = Math.floor((y - camera.y) / camera.height * camera.rows);
    return { id: camera.indexOffset + row * camera.cols + col, camera, row, col, x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function hideTooltips() { $('#baseline-tooltip').hidden = true; $('#ours-tooltip').hidden = true; }
  for (const method of ['baseline', 'ours']) {
    elements.canvas[method].addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const hit = hitToken(event, elements.canvas[method]);
      if (!hit) { state.hovered = null; hideTooltips(); drawAll(); return; }
      const stats = selectionStats(state.selection), tooltip = $(`#${method}-tooltip`);
      if (state.hovered !== hit.id) { state.hovered = hit.id; drawAll(); }
      const retained = stats[method].has(hit.id);
      const membership = stats.shared.has(hit.id) ? 'Retained by both' : stats.ours.has(hit.id) ? 'Map2Select only' : stats.baseline.has(hit.id) ? 'Baseline only' : 'Not retained';
      tooltip.replaceChildren(node('div', '', `Token ${hit.id} · ${retained ? 'retained' : 'dropped'}`), node('div', '', `${hit.camera.label || 'Image'} · row ${hit.row + 1}, col ${hit.col + 1}`), node('div', '', membership));
      hideTooltips(); tooltip.hidden = false;
      const wrap = elements.canvas[method].parentElement;
      tooltip.style.left = `${Math.max(5, Math.min(hit.x + 13, wrap.clientWidth - tooltip.offsetWidth - 5))}px`;
      tooltip.style.top = `${Math.max(5, Math.min(hit.y + 13, wrap.clientHeight - tooltip.offsetHeight - 5))}px`;
    });
    elements.canvas[method].addEventListener('pointerleave', () => { state.hovered = null; hideTooltips(); drawAll(); });
  }
  function setPlayIcon(playing) {
    elements.play.setAttribute('aria-pressed', String(playing)); elements.play.setAttribute('aria-label', playing ? 'Pause frame collection' : 'Play frame collection');
    const svg = $('svg', elements.play); svg.replaceChildren();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', playing ? 'M5 4h4v12H5ZM12 4h4v12h-4Z' : 'm7 4 9 6-9 6Z'); svg.append(path);
  }
  function stopPlayback() { state.playing = false; clearTimeout(state.playTimer); setPlayIcon(false); }
  function scheduleNext() { clearTimeout(state.playTimer); state.playTimer = setTimeout(() => { if (state.playing) selectFrame(state.frame + 1); }, state.sequence.intervalMs || 650); }
  function togglePlayback() { if (!state.sequence || state.sequence.frames.length < 2) return; if (state.playing) { stopPlayback(); } else { state.playing = true; setPlayIcon(true); scheduleNext(); } }
  function initializeDemo(data) {
    state.datasets = validateData(data);
    elements.tabs.replaceChildren(...state.datasets.map((dataset, index) => {
      const button = node('button', '', dataset.label); button.dataset.dataset = dataset.id; button.role = 'tab'; button.setAttribute('aria-selected', String(index === 0)); button.addEventListener('click', () => activateDataset(dataset.id));
      button.addEventListener('keydown', event => { if (['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + state.datasets.length) % state.datasets.length; activateDataset(state.datasets[next].id); $$('button', elements.tabs)[next].focus(); } });
      return button;
    }));
    renderGallery(); activateDataset(state.datasets[0].id);
    elements.explorer.tabIndex = 0;
  }
  async function loadDemo() {
    setBusy(true); setStatus('');
    for (const method of ['baseline', 'ours']) $('.loading-orbit', $(`#${method}-placeholder`)).hidden = false;
    try { const response = await fetch('assets/data/demo.json'); if (!response.ok) throw new Error(`Frame data could not be loaded (HTTP ${response.status}).`); initializeDemo(await response.json()); }
    catch (error) { setBusy(true, 'Frame data unavailable'); for (const method of ['baseline', 'ours']) $('.loading-orbit', $(`#${method}-placeholder`)).hidden = true; setStatus(`${error.message} Serve this page over HTTP to view its local assets.`, true); }
  }
  function renderGallery() {
    const clips = state.datasets.flatMap(dataset => dataset.sequences.map(sequence => ({ dataset, sequence }))).filter(({ dataset }) => state.gallery === 'all' || dataset.id === state.gallery);
    elements.gallery.replaceChildren();
    clips.forEach(({ dataset, sequence }) => {
      const clip = sequence.clips || {};
      const gif = safeURL(clip.gif), animated = safeURL(clip.animatedWebp) || gif, poster = safeURL(clip.poster) || safeURL(sequence.frames[0]?.image);
      const card = node('figure', 'clip-card'), media = node('div', 'clip-media'), image = node('img');
      image.src = poster || gif; image.alt = `${dataset.label}, ${sequence.title}: synchronized baseline and Map2Select token selection comparison`; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => { media.replaceChildren(node('span', 'gallery-empty', 'This clip image is unavailable. Use the explorer or download the saved selections.')); });
      media.append(image, node('span', 'clip-badge', dataset.label.toUpperCase()));
      if (animated) {
        const play = node('button', 'clip-play'); play.setAttribute('aria-label', `Play animated comparison: ${sequence.title}`); play.setAttribute('aria-pressed', 'false'); play.append(node('span', 'clip-play-icon', '▶'));
        let playing = false;
        play.addEventListener('click', () => { playing = !playing; image.src = playing ? animated : poster || gif; media.classList.toggle('is-playing', playing); play.setAttribute('aria-pressed', String(playing)); play.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} animated comparison: ${sequence.title}`); $('.clip-play-icon', play).textContent = playing ? 'Ⅱ' : '▶'; });
        media.append(play);
      }
      const caption = node('figcaption'), heading = node('div', 'clip-heading');
      heading.append(node('h3', '', sequence.title), node('span', '', `${sequence.frames.length} FRAMES`));
      const description = node('p', 'clip-caption', sequence.caption || sequence.description || 'A collection of recorded frame-level token selections.');
      const actions = node('div', 'clip-actions'), explore = node('button', '', 'Open in explorer ↗');
      explore.addEventListener('click', () => { activateDataset(dataset.id); state.sequence = sequence; state.frame = 0; elements.sequence.value = sequence.id; syncTimeline(); renderFrame(); $('#explorer').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' }); elements.sequence.focus({ preventScroll: true }); });
      actions.append(explore);
      if (gif) { const link = node('a', '', 'Download GIF ↓'); link.href = gif; link.download = `${dataset.id}-${sequence.id}.gif`; actions.append(link); }
      if (safeURL(clip.download)) { const link = node('a', '', 'Selection data ↓'); link.href = clip.download; link.download = `${dataset.id}-${sequence.id}-selections.json`; actions.append(link); }
      caption.append(heading, description, actions); card.append(media, caption); elements.gallery.append(card);
    });
    if (!clips.length) elements.gallery.append(node('div', 'gallery-empty', 'No verified clips are available for this benchmark.'));
  }
  function renderResults(data) {
    const paper = data.paper || {};
    if (paper.title) { document.title = `${paper.title} · Project Demo`; $('#paper-subtitle').textContent = paper.title.replace(/^Map2Select:\s*/, ''); $('meta[name="description"]').content = paper.abstract || paper.title; $('meta[property="og:title"]').content = paper.title; }
    if (paper.subtitle) $('.hero-description').textContent = 'Use projected HD maps as an external compute prior. Keep complementary visual evidence at a fixed token budget, without adding map tokens or retraining the VLM.';
    if (paper.abstract) $('#paper-abstract').textContent = paper.abstract;
    if (paper.version_note) $('.version-note').textContent = paper.version_note;
    if (Array.isArray(data.method?.steps)) $('#method-steps').replaceChildren(...data.method.steps.map((step, i) => { const li = node('li'), content = node('div'); content.append(node('h3', '', step.title), node('p', '', step.description)); li.append(node('span', 'step-no', String(i + 1)), content); return li; }));
    if (data.method?.caption) $('#method-caption').textContent = `Conceptual illustration. ${data.method.caption}`;
    if (data.method?.objective) { const objective = node('p', 'method-objective', data.method.objective); $('.method-text').append(objective); }
    if (Array.isArray(data.claims)) { const claims = $('#result-claims'); claims.hidden = false; claims.style.setProperty('--claim-count', data.claims.length); claims.replaceChildren(...data.claims.map(claim => { const item = node('div'); item.append(node('strong', 'claim-value', claim.value), node('span', 'claim-label', claim.label)); if (claim.note) item.append(node('span', 'claim-note', claim.note)); return item; })); }
    const content = $('#results-content'); content.replaceChildren();
    (data.datasets || []).forEach(dataset => {
      const block = node('div', 'result-block'), heading = node('div', 'result-block-heading');
      heading.append(node('h3', '', dataset.label), node('p', '', `${dataset.model ? dataset.model + ' · ' : ''}${dataset.protocol}`)); block.append(heading);
      const scroll = node('div', 'table-scroller'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `${dataset.label} results table`);
      const table = node('table'), caption = node('caption', 'sr-only', `${dataset.label} ${dataset.metric} at each token budget. ${dataset.protocol}`), thead = node('thead'), tr = node('tr');
      ['METHOD', 'VISUAL BUDGET', `${dataset.metric.toUpperCase()} ↑`, 'EVALUATION SCOPE'].forEach((text, i) => { const th = node('th', i === 2 ? 'numeric' : '', text); th.scope = 'col'; tr.append(th); }); thead.append(tr); table.append(caption, thead);
      const tbody = node('tbody'), values = dataset.rows.map(row => row.value).filter(Number.isFinite), max = Math.max(...values), min = Math.min(...values), floor = Math.max(0, min - (max - min) * .4);
      dataset.rows.forEach(row => {
        const rowEl = node('tr', row.ours ? 'ours-row' : ''), method = node('td', '', row.method), budget = node('td', '', row.budget), metric = node('td', 'numeric'), scope = node('td', '', row.scope || '');
        metric.append(document.createTextNode(Number.isFinite(row.value) ? row.value.toFixed(3) : '—'));
        if (Number.isFinite(row.value)) { const bar = node('span', 'result-bar'), fill = node('i'); fill.style.width = `${Math.max(3, (row.value - floor) / (max - floor || 1) * 100)}%`; bar.setAttribute('aria-hidden', 'true'); bar.append(fill); metric.append(bar); }
        if (row.note) rowEl.title = row.note;
        rowEl.append(method, budget, metric, scope); tbody.append(rowEl);
      });
      table.append(tbody); scroll.append(table); block.append(scroll);
      const scopeNote = node('p', 'scope-note');
      [dataset.budget_note, dataset.comparison_note].filter(Boolean).forEach((text, i) => { if (i) scopeNote.append(node('br')); scopeNote.append(document.createTextNode(text)); });
      block.append(scopeNote); content.append(block);
    });
    if (!data.datasets?.length) content.append(node('p', 'result-loading', 'Verified results are not yet available.'));
    const resources = $('#resource-links'); resources.replaceChildren();
    const resourceData = [
      ...(safeURL(paper.pdf) ? [{ type: 'PAPER', title: 'Read the paper', href: paper.pdf }] : []),
      ...(safeURL(paper.code) ? [{ type: 'PROJECT REPOSITORY', title: 'Explore this project', href: paper.code }] : []),
      { type: 'SAVED SELECTIONS', title: 'Download frame & token data', href: 'assets/data/demo.json', download: true },
      { type: 'ANIMATED COMPARISONS', title: 'View the four collections', href: '#sequences' }
    ];
    if (safeURL(paper.supplement)) resourceData.push({ type: 'SUPPLEMENT', title: 'Read the supplement', href: paper.supplement });
    resourceData.forEach((resource, i) => { const a = node('a', 'resource-item'); a.href = resource.href; if (resource.download) a.download = 'map2select-demo-selections.json'; if (/^https?:/.test(resource.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } a.append(node('span', 'resource-type', `${String(i + 1).padStart(2, '0')} · ${resource.type}`), node('strong', '', resource.title), node('span', '', resource.download ? '↓' : '↗')); resources.append(a); });
    if (paper.citation) { $('#citation-section').hidden = false; $('#citation-code').textContent = paper.citation; }
  }
  async function loadResults() {
    try { const response = await fetch('assets/data/results.json'); if (!response.ok) throw new Error(); renderResults(await response.json()); }
    catch { $('#results-content').replaceChildren(node('p', 'result-loading', 'The verified results table could not be loaded. Refresh the page or inspect the project repository.')); }
  }
  elements.sequence.addEventListener('change', () => { stopPlayback(); state.sequence = state.dataset.sequences.find(sequence => sequence.id === elements.sequence.value); state.frame = 0; syncTimeline(); renderFrame(); });
  elements.budget.addEventListener('change', () => { stopPlayback(); state.budget = elements.budget.value; renderFrame(); });
  elements.slider.addEventListener('input', () => { stopPlayback(); selectFrame(Number(elements.slider.value)); });
  elements.previous.addEventListener('click', () => { stopPlayback(); selectFrame(state.frame - 1); });
  elements.next.addEventListener('click', () => { stopPlayback(); selectFrame(state.frame + 1); });
  elements.play.addEventListener('click', togglePlayback);
  $$('[data-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); drawAll(); }));
  $('#show-grid').addEventListener('change', event => { state.grid = event.target.checked; drawAll(); });
  $('#overlay-opacity').addEventListener('input', event => { state.opacity = Number(event.target.value) / 100; drawAll(); });
  elements.explorer.addEventListener('keydown', event => {
    if (!state.sequence || ['INPUT', 'SELECT', 'BUTTON', 'A', 'TEXTAREA'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); stopPlayback(); selectFrame(state.frame + (event.key === 'ArrowRight' ? 1 : -1)); }
    else if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  });
  $$('.gallery-filter').forEach(button => button.addEventListener('click', () => { state.gallery = button.dataset.gallery; $$('.gallery-filter').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); }); renderGallery(); }));
  $('.menu-toggle').addEventListener('click', () => { const open = $('.menu-toggle').getAttribute('aria-expanded') !== 'true'; $('.menu-toggle').setAttribute('aria-expanded', String(open)); $('#site-nav').classList.toggle('is-open', open); });
  $$('#site-nav a').forEach(a => a.addEventListener('click', () => { $('.menu-toggle').setAttribute('aria-expanded', 'false'); $('#site-nav').classList.remove('is-open'); }));
  $('#copy-citation').addEventListener('click', async () => {
    const button = $('#copy-citation'), citation = $('#citation-code').textContent;
    try { await navigator.clipboard.writeText(citation); button.textContent = 'Copied ✓'; $('#copy-status').textContent = 'Citation copied.'; setTimeout(() => { button.textContent = 'Copy BibTeX ⧉'; }, 2200); }
    catch { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents($('#citation-code')); selection.removeAllRanges(); selection.addRange(range); button.textContent = 'Select & copy manually'; $('#copy-status').textContent = 'Citation selected. Use your browser’s copy command.'; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  new ResizeObserver(() => drawAll()).observe(elements.explorer);
  loadDemo(); loadResults();
  window.Map2SelectDemo = { getState: () => ({ dataset: state.dataset?.id, sequence: state.sequence?.id, frame: state.frame, budget: state.budget, view: state.view, playing: state.playing, grid: state.grid }), getSelectionStats: () => { if (!state.selection) return null; const stats = selectionStats(state.selection); return { baseline: stats.baseline.size, ours: stats.ours.size, shared: stats.shared.size, oursOnly: stats.oursOnly, baselineOnly: stats.baselineOnly }; } };
})();
