/* Everything on the page that isn't the grain field: scroll stages, kinetic masthead,
   career graph, tool map, the plate control, and the in-browser retriever. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var Field = window.Field || null;
  var SVG = 'http://www.w3.org/2000/svg';
  var el = function (name, attrs, parent) {
    var n = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  };

  var vw = innerWidth, vh = innerHeight;

  /* ---------- Scroll stages: which figure, which tone ---------- */
  var stages = [];
  function layoutFor(figure, name) {
    var meta = Field.figures[name] || { w: 2, h: 2, max: 1 };
    var aspect = vw / vh, narrow = vw < 820, ox = 0, oy = 0, fw = 1, fh = 1;
    if (figure === 'right') {
      if (narrow) { oy = .46; fh = .52; } else { ox = .42; fw = .56; }
    }
    if (figure === 'center' && narrow) { oy = .12; fh = .72; }
    if (figure === 'full') return { ox: 0, oy: narrow && name !== 'string' && name !== 'dunes' && name !== 'dust' ? .4 : 0, s: name === 'string' && narrow ? .8 : (meta.max || 1) };
    var s = Math.min(2 * aspect * fw * .96 / meta.w, 2 * fh * .96 / meta.h, meta.max || 1);
    return { ox: ox, oy: oy, s: s };
  }
  function measure() {
    vw = innerWidth || 1; vh = innerHeight || 1;
    var y = scrollY;
    stages = $$('[data-shape]').map(function (e) {
      return { el: e, shape: e.dataset.shape, figure: e.dataset.figure || 'center', tone: e.dataset.tone || null, top: e.getBoundingClientRect().top + y };
    }).sort(function (a, b) { return a.top - b.top; });
    var tone = 'plate';
    stages.forEach(function (s) { tone = s.tone || tone; s.tone = tone; });
    if (Field) stages.forEach(function (s) { s.layout = layoutFor(s.figure, s.shape); Field.layoutFor(s.shape, s.layout); });
    if (Field) applyLayoutsFor(currentIndex);
  }
  var currentIndex = 0;
  function applyLayoutsFor(i) {
    // a figure used by more than one stage takes the layout of the nearest one
    [i - 1, i + 1, i].forEach(function (k) { var s = stages[k]; if (s) Field.layoutFor(s.shape, s.layout); });
  }

  var scrollV = 0, lastY = scrollY, lastT = performance.now(), hereLink = null;
  var navLinks = $$('.hud__nav a'), navTargets = navLinks.map(function (a) { return $(a.getAttribute('href')); });

  function onScrollFrame(now) {
    var y = scrollY, dt = Math.max(1, now - lastT);
    scrollV += (((y - lastY) / dt * 1000) - scrollV) * .18;
    lastY = y; lastT = now;

    var center = y + vh * .5, W = vh * .72, i = 0;
    for (var k = 0; k < stages.length; k++) if (stages[k].top <= center) i = k;
    var st = stages[i];
    if (!st) return;
    if (i !== currentIndex) {
      currentIndex = i;
      if (Field) applyLayoutsFor(i);
    }
    if (document.body.dataset.tone !== st.tone) {
      document.body.dataset.tone = st.tone;
      if (Field) Field.setTone(st.tone);
      scopeColor = null;
    }
    if (Field) {
      var next = stages[i + 1], prev = stages[i - 1], a = st.shape, b = st.shape, mix = 0;
      if (next && center > next.top - W / 2) { b = next.shape; mix = (center - (next.top - W / 2)) / W; }
      else if (prev && center < st.top + W / 2) { a = prev.shape; mix = (center - (st.top - W / 2)) / W; }
      Field.target.a = a; Field.target.b = b; Field.target.mix = clamp(mix, 0, 1);
      Field.agitate = Math.min(1, Math.abs(scrollV) / 2600);
    }

    var active = -1;
    navTargets.forEach(function (t, n) { if (t && t.getBoundingClientRect().top < vh * .5) active = n; });
    var link = navLinks[active] || null;
    if (link !== hereLink) {
      if (hereLink) hereLink.classList.remove('is-here');
      if (link) link.classList.add('is-here');
      hereLink = link;
    }

    updateLogLive(center);
    drawScope(now, y);
    waveMasthead(now, y);
    if (plateAuto && Field && st.shape === 'plate') autoPlate(now);
  }

  /* ---------- Masthead: type on a vibrating plate ---------- */
  var mast = [], mastEnergy = .2, ptrX = -1, ptrY = -1;
  function setupMasthead() {
    $$('[data-kinetic]').forEach(function (line) {
      var text = line.textContent;
      line.textContent = '';
      var letters = text.split('').map(function (c) {
        var s = document.createElement('span');
        s.textContent = c;
        s.setAttribute('aria-hidden', 'true');
        line.appendChild(s);
        return s;
      });
      mast.push({ line: line, letters: letters, base: 100, xs: [] });
    });
    fitMasthead();
    addEventListener('pointermove', function (e) { ptrX = e.clientX; ptrY = e.clientY; }, { passive: true });
  }
  function setWidth(m, w) {
    m.letters.forEach(function (s) { s.style.fontVariationSettings = '"wdth" ' + w; });
  }
  function fitMasthead() {
    var wrap = $('.masthead');
    wrap.style.fontSize = '';
    var room = innerWidth - Math.max(40, innerWidth * .05);
    var size = parseFloat(getComputedStyle(wrap).fontSize);
    mast.forEach(function (m) {
      var lo = 50, hi = 150;
      setWidth(m, 50);
      if (m.line.getBoundingClientRect().width > room) { size *= room / m.line.getBoundingClientRect().width * .98; }
    });
    wrap.style.fontSize = size + 'px';
    mast.forEach(function (m) {
      var lo = 50, hi = 150;
      for (var i = 0; i < 9; i++) {
        var mid = (lo + hi) / 2;
        setWidth(m, mid);
        if (m.line.getBoundingClientRect().width > room) hi = mid; else lo = mid;
      }
      m.base = lo;
      setWidth(m, lo);
      m.xs = m.letters.map(function (s) { var r = s.getBoundingClientRect(); return r.left + r.width / 2; });
    });
  }
  function waveMasthead(now, y) {
    if (reduced || !mast.length || y > vh) return;
    var t = now / 1000;
    mastEnergy += ((.2 + Math.min(1, Math.abs(scrollV) / 1200) * .9) - mastEnergy) * .08;
    mast.forEach(function (m, li) {
      var deltas = m.letters.map(function (_, i) {
        var near = ptrY >= 0 && ptrY < vh ? Math.exp(-Math.pow((m.xs[i] - ptrX) / (vw * .09), 2)) * 26 : 0;
        return Math.sin(i * .9 - t * 1.1 + li * 1.7) * 24 * mastEnergy + near;
      });
      var mean = deltas.reduce(function (a, b) { return a + b; }, 0) / deltas.length;
      m.letters.forEach(function (s, i) {
        s.style.fontVariationSettings = '"wdth" ' + clamp(m.base + deltas[i] - mean, 50, 150).toFixed(1);
      });
    });
  }

  /* ---------- Scope in the corner: the page's noise floor falls as you read ---------- */
  var scope = $('#scope'), sctx = scope.getContext('2d'), scopeLabel = $('#scope-label'), scopeColor = null, scopeShown = '';
  function drawScope(now, y) {
    if (scope.offsetParent === null) return;
    var max = Math.max(1, document.documentElement.scrollHeight - vh), p = clamp(y / max, 0, 1);
    if (!scopeColor) scopeColor = document.body.dataset.tone === 'night' ? '#E3F2DA' : '#11180F';
    var w = scope.width, h = scope.height, noise = Math.pow(1 - p, 1.5) * .9, t = now / 1000;
    sctx.clearRect(0, 0, w, h);
    sctx.beginPath();
    for (var x = 0; x <= w; x += 2) {
      var v = Math.sin(x * .045 - t * (reduced ? 0 : 2.2)) * .5 * (1 - noise * .55) + (reduced ? 0 : (Math.random() - .5) * noise * 1.15);
      var py = h / 2 + v * (h / 2 - 3);
      if (x) sctx.lineTo(x, py); else sctx.moveTo(x, py);
    }
    sctx.strokeStyle = scopeColor; sctx.lineWidth = 2; sctx.stroke();
    var label = p > .985 ? 'SNR max' : 'SNR ' + (p * 46 - 6 >= 0 ? '+' : '') + Math.round(p * 46 - 6) + ' dB';
    if (label !== scopeShown) { scopeLabel.textContent = label; scopeShown = label; }
  }

  /* ---------- Headlines resolve out of noise when they first appear ---------- */
  function setupDenoise() {
    if (reduced || !('IntersectionObserver' in window)) return;
    var glyphs = 'अकखगघचजटडतदनपबमयरलवशसह∂∑∫λσ01#%/\\+=<>'.split('');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        denoise(en.target, glyphs);
      });
    }, { threshold: .25 });
    $$('[data-denoise]').forEach(function (h) { h.setAttribute('aria-label', h.textContent); io.observe(h); });
    addEventListener('beforeprint', function () { denoiseOff = true; io.disconnect(); });
  }
  var denoiseOff = false;
  function denoise(h, glyphs) {
    var text = h.textContent, frag = document.createDocumentFragment(), chars = [];
    text.split(/(\s+)/).forEach(function (word) {
      if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(' ')); return; }
      var w = document.createElement('span');
      w.style.cssText = 'display:inline-block;white-space:nowrap';
      w.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (c) {
        var s = document.createElement('span');
        s.style.cssText = 'display:inline-block;text-align:center';
        s.textContent = c; w.appendChild(s); chars.push({ s: s, c: c });
      });
      frag.appendChild(w);
    });
    h.textContent = '';
    h.appendChild(frag);
    chars.forEach(function (o) { o.w = o.s.getBoundingClientRect().width; });
    chars.forEach(function (o) { o.s.style.width = o.w + 'px'; });
    var start = performance.now(), dur = Math.min(1100, 420 + chars.length * 22), lastSwap = 0;
    addEventListener('beforeprint', function () { h.textContent = text; });
    (function run(now) {
      if (denoiseOff) { h.textContent = text; return; }
      var p = (now - start) / dur, swap = now - lastSwap > 55;
      if (swap) lastSwap = now;
      chars.forEach(function (o, i) {
        var at = (i / chars.length) * .72 + .1 * ((i * 7919) % 10) / 10;
        if (p >= at) { if (o.s.textContent !== o.c) { o.s.textContent = o.c; o.s.style.opacity = ''; } }
        else if (swap) { o.s.textContent = glyphs[(Math.random() * glyphs.length) | 0]; o.s.style.opacity = '.6'; }
      });
      if (p < 1) requestAnimationFrame(run);
      else h.textContent = text;   // back to plain text so kerning and wrapping return
    })(start);
  }

  /* ---------- Career log: branches off main, drawn from the dates in the HTML ---------- */
  var liveLanes = [], logNow = null, logLabel = null, logY = null, logTop = 0;
  var monthNum = function (s) { var p = s.split('-'); return +p[0] * 12 + +p[1] - 1; };
  var monthName = function (n) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n % 12] + ' ' + Math.floor(n / 12); };

  function computePeak(rows) {
    var months = {};
    rows.forEach(function (r) { for (var m = r.s; m <= r.e; m++) months[m] = (months[m] || 0) + 1; });
    return Object.keys(months).reduce(function (a, k) { return Math.max(a, months[k]); }, 0);
  }
  function drawLog() {
    var svg = $('#log-graph'), list = $('.log__list'), box = list.getBoundingClientRect();
    logTop = box.top + scrollY;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var rows = $$('.commit', list).map(function (li) {
      var head = $('h3', li).getBoundingClientRect();
      var cats = li.dataset.cat.split(' ');
      return {
        li: li, y: head.top - box.top + head.height / 2, cat: cats[0], cats: cats, main: li.hasAttribute('data-main'),
        s: monthNum(li.dataset.start), e: monthNum(li.dataset.end || li.dataset.start)
      };
    });
    var pts = rows.map(function (r) { return [r.s, r.y]; }).sort(function (a, b) { return a[0] - b[0]; });
    var yOf = function (d) {
      if (d <= pts[0][0]) return pts[0][1];
      for (var i = 1; i < pts.length; i++) {
        if (d <= pts[i][0]) {
          var a = pts[i - 1], b = pts[i];
          return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
        }
      }
      return pts[pts.length - 1][1];
    };
    var branches = rows.filter(function (r) { return !r.main; });
    $('#ledger-roles').textContent = branches.length;
    $('#ledger-peak').textContent = computePeak(branches);

    var gutter = svg.getBoundingClientRect().width, x0 = 8, laneW = Math.min(24, (gutter - 30) / 6);
    svg.setAttribute('viewBox', '0 0 ' + gutter + ' ' + box.height);
    var laneEnd = [];
    branches.slice().sort(function (a, b) { return a.s - b.s || b.y - a.y; }).forEach(function (r) {
      var l = 0;
      while (laneEnd[l] !== undefined && laneEnd[l] >= r.s) l++;
      laneEnd[l] = r.e; r.lane = l + 1;
    });

    var mainRows = rows.filter(function (r) { return r.main; });
    var topY = mainRows[0].y, botY = mainRows[mainRows.length - 1].y, todayY = yOf(monthNum('2026-11'));
    el('path', { d: 'M' + x0 + ' ' + todayY + ' L' + x0 + ' ' + botY, class: 'main' }, svg);
    el('path', { d: 'M' + x0 + ' ' + topY + ' L' + x0 + ' ' + todayY, class: 'main', 'stroke-dasharray': '3 5' }, svg);
    mainRows.forEach(function (r) { el('circle', { cx: x0, cy: r.y, r: 4.5, class: 'node--main' }, svg); });

    liveLanes = [];
    branches.forEach(function (r) {
      var x = x0 + r.lane * laneW, ys = r.y, ye = Math.min(yOf(r.e), ys - 34);
      var d = 'M' + x0 + ' ' + (ys + 24) + ' C' + x0 + ' ' + (ys + 10) + ',' + x + ' ' + (ys + 14) + ',' + x + ' ' + ys +
              ' L' + x + ' ' + (ye + 18) + ' C' + x + ' ' + (ye + 6) + ',' + x0 + ' ' + (ye + 6) + ',' + x0 + ' ' + (ye - 6);
      var path = el('path', { d: d, class: 'lane--' + r.cat }, svg);
      var dot = el('circle', { cx: x, cy: ys, r: 4.5, class: 'node--' + r.cat }, svg);
      el('line', { x1: x + 6, y1: ys, x2: gutter - 4, y2: ys, stroke: 'currentColor', 'stroke-width': .5, opacity: .3 }, svg);
      liveLanes.push({ path: path, dot: dot, r: r, top: ye, bot: ys + 24 });
    });
    logNow = el('line', { id: 'log-now', x1: 0, x2: gutter, y1: -10, y2: -10 }, svg);
    logLabel = el('text', { id: 'log-now-label', x: gutter - 2, y: -10, 'text-anchor': 'end' }, svg);
    logY = yOf;
    logDates = pts;
  }
  var logDates = [];
  function dateAt(y) {
    for (var i = 1; i < logDates.length; i++) {
      var a = logDates[i - 1], b = logDates[i];
      if (y <= a[1] && y >= b[1] && a[1] !== b[1]) return Math.round(a[0] + (b[0] - a[0]) * (a[1] - y) / (a[1] - b[1]));
    }
    return null;
  }
  function updateLogLive(center) {
    if (!logNow) return;
    var y = center - logTop, h = $('.log__list').getBoundingClientRect().height;
    if (y < -vh || y > h + vh) return;
    var inside = y > 0 && y < h;
    logNow.setAttribute('y1', inside ? y : -40);
    logNow.setAttribute('y2', inside ? y : -40);
    var d = inside ? dateAt(y) : null;
    logLabel.setAttribute('y', inside ? y - 5 : -40);
    logLabel.textContent = d !== null ? monthName(d) : '';
    liveLanes.forEach(function (l) { l.path.classList.toggle('is-live', inside && y >= l.top && y <= l.bot); });
  }
  function setupLogFilters() {
    $$('.filters button').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.dataset.filter;
        $$('.filters button').forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
        $$('.commit:not(.commit--main)').forEach(function (li) {
          li.classList.toggle('is-dim', f !== 'all' && li.dataset.cat.split(' ').indexOf(f) < 0);
        });
        liveLanes.forEach(function (l) {
          var off = f !== 'all' && l.r.cats.indexOf(f) < 0;
          l.path.classList.toggle('is-dim', off);
          l.dot.style.opacity = off ? .12 : 1;
        });
      });
    });
  }

  /* ---------- Tool map ---------- */
  var net = $('#net'), edges = [], netTouched = false, netCycle = 0;
  function drawNet() {
    var svg = $('.net__edges'), box = net.getBoundingClientRect();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    edges = [];
    var tools = {};
    $$('[data-tool]', net).forEach(function (b) { tools[b.dataset.tool] = b; });
    $$('[data-uses]', net).forEach(function (w) {
      var wr = w.getBoundingClientRect(), wy = wr.top - box.top + wr.height / 2, wx = wr.left - box.left;
      w.dataset.uses.split(' ').forEach(function (id) {
        var t = tools[id];
        if (!t) return;
        var tr = t.getBoundingClientRect(), ty = tr.top - box.top + tr.height / 2, tx = tr.right - box.left;
        var mid = (tx + wx) / 2;
        var p = el('path', { d: 'M' + tx + ' ' + ty + ' C' + mid + ' ' + ty + ',' + mid + ' ' + wy + ',' + wx + ' ' + wy }, svg);
        edges.push({ p: p, t: t, w: w });
      });
    });
    if (netCurrent) lightNet(netCurrent);
  }
  var netCurrent = null;
  function lightNet(btn) {
    netCurrent = btn;
    net.classList.toggle('is-active', !!btn);
    $$('button', net).forEach(function (b) { b.classList.remove('is-on'); });
    edges.forEach(function (e) {
      var on = btn && (e.t === btn || e.w === btn);
      e.p.classList.toggle('is-on', !!on);
      if (on) { e.t.classList.add('is-on'); e.w.classList.add('is-on'); }
    });
    if (btn) btn.classList.add('is-on');
  }
  function setupNet() {
    var buttons = $$('button', net);
    buttons.forEach(function (b) {
      b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { netTouched = true; lightNet(b); } });
      b.addEventListener('focus', function () { netTouched = true; lightNet(b); });
      b.addEventListener('click', function () { netTouched = true; lightNet(b); });
    });
    var works = $$('[data-uses]', net);
    lightNet(works[0]);
    if (!reduced) setInterval(function () {
      if (netTouched) return;
      var r = net.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      netCycle = (netCycle + 1) % works.length;
      lightNet(works[netCycle]);
    }, 2400);
  }

  /* ---------- Plate control and tone ---------- */
  // Square-plate modes with n < m, ordered by frequency (proportional to n² + m²).
  var MODES = [[1,2],[1,3],[2,3],[1,4],[2,4],[3,4],[2,5],[3,5],[4,5],[3,6],[5,6],[4,7],[5,7],[6,7]];
  var plateAuto = true, plateInput = $('#plate-mode'), plateRead = $('#plate-read'), plateSound = $('#plate-sound');
  var audio = null, osc = null, gain = null, plateVal = 4;
  function hzFor(n, m) { return Math.round(16 * (n * n + m * m)); }
  function setPlate(v) {
    plateVal = v;
    var i = clamp(Math.floor(v), 0, MODES.length - 2), f = v - i, a = MODES[i], b = MODES[i + 1];
    var n = a[0] + (b[0] - a[0]) * f, m = a[1] + (b[1] - a[1]) * f;
    if (Field) { Field.mode.n = n; Field.mode.m = m; }
    var hz = hzFor(n, m);
    plateRead.textContent = 'n = ' + n.toFixed(1) + ', m = ' + m.toFixed(1) + ' · ' + hz + ' Hz';
    if (osc && audio) osc.frequency.setTargetAtTime(hz, audio.currentTime, .05);
  }
  function autoPlate(now) {
    if (reduced) return;
    var v = 6.5 + 6.5 * Math.sin(now / 9000);
    plateInput.value = v;
    setPlate(v);
  }
  function setupPlate() {
    plateInput.addEventListener('input', function () { plateAuto = false; setPlate(+plateInput.value); });
    plateSound.addEventListener('click', function () {
      var on = plateSound.getAttribute('aria-pressed') !== 'true';
      plateSound.setAttribute('aria-pressed', on);
      plateSound.textContent = on ? 'Sound on' : 'Hear it';
      if (on) {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
        osc = audio.createOscillator(); gain = audio.createGain();
        osc.type = 'sine'; gain.gain.value = 0;
        osc.connect(gain); gain.connect(audio.destination);
        var i = clamp(Math.round(plateVal), 0, MODES.length - 1);
        osc.frequency.value = hzFor(MODES[i][0], MODES[i][1]);
        osc.start();
        gain.gain.setTargetAtTime(.05, audio.currentTime, .08);
      } else stopTone();
    });
    setPlate(plateVal);
    var plateChapter = $('#nvh');
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting && osc) { stopTone(); plateSound.setAttribute('aria-pressed', false); plateSound.textContent = 'Hear it'; }
    }).observe(plateChapter);
  }
  function stopTone() {
    if (!osc) return;
    gain.gain.setTargetAtTime(0, audio.currentTime, .05);
    var o = osc; setTimeout(function () { o.stop(); }, 300);
    osc = null;
  }

  /* ---------- Ask: BM25 and PCA over this page's own text ---------- */
  var STOP = {}; 'a an and are as at be been but by can did do does for from had has have how i if in into is it its me my of on or our so that the their them then there these they this to us was we were what when where which who why will with would you your yours about any ever'.split(' ').forEach(function (w) { STOP[w] = 1; });
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ers|ies|ed|es|s)$/, '') : w; }
  function tokens(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']s\b/g, '')
      .split(/[^a-z0-9+#]+/).filter(function (w) { return w && !STOP[w]; }).map(stem);
  }
  var corpus = [], idf = {}, avgLen = 0, comps = null, dotsById = [], plotScale = null;

  function labelFor(node) {
    var host = node.closest('.chapter, .commit, .archive__list li, .card__rows > div, .thesis, .stack, .contact, .hero');
    if (!host) return 'This page';
    if (host.matches('.chapter')) return $('h3', host).getAttribute('aria-label') || $('h3', host).textContent;
    if (host.matches('.commit')) return $('h3', host).textContent + ', ' + $('.commit__where', host).textContent;
    if (host.matches('li')) return $('b', host).textContent.replace(' ↗', '');
    if (host.matches('.card__rows > div')) return 'Model card: ' + $('dt', host).textContent;
    if (host.matches('.thesis')) return 'About';
    if (host.matches('.stack')) return 'Stack';
    if (host.matches('.contact')) return 'Contact';
    return 'Opening';
  }
  function anchorFor(node) {
    var host = node.closest('[id]');
    return host ? '#' + host.id : '#top';
  }
  function buildCorpus() {
    corpus = $$('[data-q]').map(function (n) {
      var text = n.matches('li') ? $('b', n).textContent.replace(' ↗', '') + '. ' + $('span', n).textContent + ' (' + $('em', n).textContent + ')' : n.textContent.trim();
      var toks = tokens(text).concat(tokens(n.dataset.k || ''));
      var tf = {};
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      return { text: text, label: labelFor(n), href: anchorFor(n), tf: tf, len: toks.length };
    });
    var df = {};
    corpus.forEach(function (d) { Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var N = corpus.length;
    Object.keys(df).forEach(function (t) { idf[t] = Math.log(1 + (N - df[t] + .5) / (df[t] + .5)); });
    avgLen = corpus.reduce(function (a, d) { return a + d.len; }, 0) / N;
    buildPlot();
  }
  function bm25(qToks, d) {
    var k1 = 1.4, b = .4, s = 0;
    qToks.forEach(function (t) {
      var f = d.tf[t];
      if (!f) return;
      s += idf[t] * f * (k1 + 1) / (f + k1 * (1 - b + b * d.len / avgLen));
    });
    return s;
  }
  /* Two principal components of the document-term matrix, by power iteration on the Gram matrix. */
  function buildPlot() {
    var terms = Object.keys(idf), index = {};
    terms.forEach(function (t, i) { index[t] = i; });
    var X = corpus.map(function (d) {
      var v = new Float64Array(terms.length), norm = 0;
      Object.keys(d.tf).forEach(function (t) { var w = (1 + Math.log(d.tf[t])) * idf[t]; v[index[t]] = w; norm += w * w; });
      norm = Math.sqrt(norm) || 1;
      for (var i = 0; i < v.length; i++) v[i] /= norm;
      return v;
    });
    var D = X.length, T = terms.length, mean = new Float64Array(T);
    X.forEach(function (v) { for (var i = 0; i < T; i++) mean[i] += v[i] / D; });
    X.forEach(function (v) { for (var i = 0; i < T; i++) v[i] -= mean[i]; });
    var G = X.map(function (a) { return X.map(function (b) { var s = 0; for (var i = 0; i < T; i++) s += a[i] * b[i]; return s; }); });
    var pcs = [], R = (function () { var s = 7; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (var c = 0; c < 2; c++) {
      var v = new Float64Array(D).map(function () { return R() - .5; }), lambda = 1;
      for (var it = 0; it < 70; it++) {
        var w = new Float64Array(D);
        for (var i = 0; i < D; i++) for (var j = 0; j < D; j++) w[i] += G[i][j] * v[j];
        pcs.forEach(function (pc) {
          var dot = 0; for (var i2 = 0; i2 < D; i2++) dot += w[i2] * pc.v[i2];
          for (i2 = 0; i2 < D; i2++) w[i2] -= dot * pc.v[i2];
        });
        lambda = Math.sqrt(w.reduce(function (a, x) { return a + x * x; }, 0)) || 1;
        for (i = 0; i < D; i++) v[i] = w[i] / lambda;
      }
      pcs.push({ v: v, lambda: lambda });
    }
    // term-space axes so a new query can be projected the same way
    var axes = pcs.map(function (pc) {
      var a = new Float64Array(T), s = Math.sqrt(pc.lambda) || 1;
      for (var d = 0; d < D; d++) for (var i = 0; i < T; i++) a[i] += X[d][i] * pc.v[d] / s;
      return a;
    });
    comps = { axes: axes, mean: mean, index: index, T: T };
    var pts = X.map(function (v) { return axes.map(function (a) { var s = 0; for (var i = 0; i < T; i++) s += a[i] * v[i]; return s; }); });
    // signed square root spreads the crowd in the middle
    var warp = function (x) { return (x < 0 ? -1 : 1) * Math.sqrt(Math.abs(x)); };
    var xs = pts.map(function (p) { return warp(p[0]); }), ys = pts.map(function (p) { return warp(p[1]); });
    var xMax = Math.max.apply(null, xs.map(Math.abs)) || 1, yMax = Math.max.apply(null, ys.map(Math.abs)) || 1;
    plotScale = function (p) {
      return [200 + clamp(warp(p[0]) / xMax, -1.05, 1.05) * 170, 150 - clamp(warp(p[1]) / yMax, -1.05, 1.05) * 122];
    };
    var svg = $('#ask-plot');
    dotsById = pts.map(function (p, i) {
      var xy = plotScale(p);
      corpus[i].xy = xy;
      return el('circle', { cx: xy[0], cy: xy[1], r: 2.6 }, svg);
    });
    plotLinks = el('g', {}, svg);
    svg.appendChild(plotLinks);
  }
  var plotLinks = null;
  function projectQuery(qToks) {
    var tf = {}; qToks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    var v = new Float64Array(comps.T), norm = 0;
    Object.keys(tf).forEach(function (t) {
      if (comps.index[t] === undefined) return;
      var w = (1 + Math.log(tf[t])) * idf[t]; v[comps.index[t]] = w; norm += w * w;
    });
    norm = Math.sqrt(norm) || 1;
    return comps.axes.map(function (a) { var s = 0; for (var i = 0; i < comps.T; i++) s += a[i] * ((v[i] / norm) - comps.mean[i]); return s; });
  }
  function ask(q) {
    var qToks = tokens(q), out = $('#ask-answer');
    var scored = corpus.map(function (d, i) { return { d: d, i: i, s: bm25(qToks, d) }; }).sort(function (a, b) { return b.s - a.s; });
    var best = scored[0];
    var known = qToks.filter(function (t) { return idf[t] !== undefined; });
    var coverage = qToks.length ? known.length / qToks.length : 0;
    var answered = best && best.s > 2.1 && coverage >= .5;
    while (out.firstChild) out.removeChild(out.firstChild);

    var lane = document.createElement('span');
    lane.className = 'ask__lane ' + (answered ? 'ask__lane--ok' : 'ask__lane--no');
    lane.textContent = answered ? 'Quoted from this page' : 'Not on this page';
    out.appendChild(lane);

    var quote = document.createElement('p');
    quote.className = 'ask__quote';
    quote.textContent = answered ? best.d.text : 'Nothing here answers that, so I won’t guess. Email me and I’ll tell you myself.';
    out.appendChild(quote);

    var meta = document.createElement('p');
    meta.className = 'ask__meta';
    if (answered) {
      var a = document.createElement('a');
      a.href = best.d.href; a.textContent = 'Source: ' + best.d.label + ' ↓';
      meta.appendChild(a);
    } else {
      var m = document.createElement('a');
      m.href = '#contact'; m.textContent = 'Contact details ↓';
      meta.appendChild(m);
    }
    out.appendChild(meta);

    var top = scored.filter(function (x) { return x.s > 0; }).slice(0, 4);
    if (answered && top.length) {
      var ul = document.createElement('ol');
      ul.className = 'ask__rank';
      var maxS = top[0].s;
      top.forEach(function (x) {
        var li = document.createElement('li');
        var link = document.createElement('a'); link.href = x.d.href; link.textContent = x.d.label;
        var bar = document.createElement('i'); bar.style.transform = 'scaleX(' + (x.s / maxS).toFixed(3) + ')';
        var sc = document.createElement('b'); sc.textContent = x.s.toFixed(1);
        li.appendChild(link); li.appendChild(bar); li.appendChild(sc);
        ul.appendChild(li);
      });
      out.appendChild(ul);
    }

    // plot
    dotsById.forEach(function (c) { c.classList.remove('is-hit', 'is-q'); c.setAttribute('r', 2.6); });
    while (plotLinks.firstChild) plotLinks.removeChild(plotLinks.firstChild);
    var qp = plotScale(projectQuery(qToks));
    (answered ? top.slice(0, 3) : []).forEach(function (x, i) {
      var xy = x.d.xy;
      el('line', { x1: qp[0], y1: qp[1], x2: xy[0], y2: xy[1], opacity: 1 - i * .28 }, plotLinks);
      dotsById[x.i].classList.add('is-hit');
      dotsById[x.i].setAttribute('r', 4.6);
      if (i === 0) {
        var t = el('text', { x: clamp(xy[0], 6, 394), y: xy[1] - 9, 'text-anchor': xy[0] > 300 ? 'end' : (xy[0] < 100 ? 'start' : 'middle') }, plotLinks);
        t.textContent = x.d.label.slice(0, 36);
      }
    });
    var qc = el('circle', { cx: qp[0], cy: qp[1], r: 5.5, class: 'is-q' }, plotLinks);
    qc.setAttribute('aria-hidden', 'true');
  }
  function setupAsk() {
    buildCorpus();
    var form = $('#ask-form'), input = $('#ask-input');
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    $$('.ask__chips button').forEach(function (b) {
      b.addEventListener('click', function () { input.value = b.textContent; ask(b.textContent); });
    });
    ask(input.value);
    addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        $('#ask').scrollIntoView();
        input.focus({ preventScroll: true });
        input.select();
      }
    });
  }

  /* ---------- Small things ---------- */
  function setupContact() {
    var copy = $('#copy-mail'), mail = $('#mail');
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(mail.textContent).then(done, function () { selectMail(mail); });
      else selectMail(mail);
    });
    var cv = $('#save-cv');
    // Printing is refused inside embedded previews, so only offer it on the real page.
    if (window.self !== window.top) cv.parentNode.hidden = true;
    cv.addEventListener('click', function () { window.print(); });
    if (Field) $('#grain-count').textContent = 'The portrait is ' + Field.N.toLocaleString('en-US') + ' grains sampled from one photo.';
  }
  function selectMail(mail) {
    var r = document.createRange(); r.selectNodeContents(mail);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function hello() {
    console.log('%cYou read consoles. We should talk.', 'font:700 15px monospace;color:#D8321A');
    console.log('ramamagarwal1234@gmail.com\nEverything here is plain HTML, CSS and JS, so view source works. The grain shader is in assets/js/field.js.');
  }

  /* ---------- Boot ---------- */
  function relayout() {
    measure();
    drawLog();
    drawNet();
    if (mast.length) fitMasthead();
  }
  var resizeTimer = 0;
  addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 140); });

  function loop(now) {
    onScrollFrame(now);
    requestAnimationFrame(loop);
  }

  setupMasthead();
  setupLogFilters();
  setupNet();
  setupPlate();
  setupAsk();
  setupContact();
  setupDenoise();
  measure();
  drawLog();
  drawNet();
  hello();
  requestAnimationFrame(loop);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  addEventListener('load', relayout);
  addEventListener('fieldready', measure);
  if ('ResizeObserver' in window) {
    var lastH = 0;
    new ResizeObserver(function () {
      var h = document.documentElement.scrollHeight;
      if (Math.abs(h - lastH) > 4) { lastH = h; clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 180); }
    }).observe(document.body);
  }
  addEventListener('beforeprint', function () { mast.forEach(function (m) { setWidth(m, 100); }); });
  addEventListener('afterprint', fitMasthead);
})();
