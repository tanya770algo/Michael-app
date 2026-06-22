/*
 * app.js - הלוגיקה הראשית של ה-frontend.
 * מתאם בין העלאת קובץ, הניתוח בשרת, תצוגת התווים, הנגן, המקלדת ומצב המשחק.
 *
 * שני מצבי נגינה:
 *   'audio' - שיר שהועלה כקובץ: ניגון דרך תג <audio>, הסנכרון לפי audio.currentTime.
 *   'synth' - שיר דוגמה / שיר שמור (בלי קובץ): ניגון בצלילים מסונתזים (Web Audio),
 *             הסנכרון לפי שעון פנימי. ככה גם שירים שמורים מתנגנים בלי הקובץ המקורי.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function api(path, opts) { return fetch('/api/michael-king' + path, opts); }

  var el = {
    welcome: $('welcome'), startBtn: $('startBtn'),
    uploadSection: $('uploadSection'), dropZone: $('dropZone'), fileInput: $('fileInput'),
    chooseBtn: $('chooseBtn'), demoBtn: $('demoBtn'),
    accuracyNotice: $('accuracyNotice'), noticeClose: $('noticeClose'),
    loading: $('loading'), loadingText: $('loadingText'),
    results: $('resultsSection'), songTitle: $('songTitle'), uploadAnotherBtn: $('uploadAnotherBtn'),
    playBtn: $('playBtn'), restartBtn: $('restartBtn'),
    progress: $('progress'), progressFill: $('progressFill'), progressKnob: $('progressKnob'),
    curTime: $('curTime'), totTime: $('totTime'),
    notesStrip: $('notesStrip'), piano: $('piano'), gameBtn: $('gameBtn'),
    songsList: $('songsList'), noSongs: $('noSongs'),
    audioEl: $('audioEl'), toast: $('toast'),
    speedBtns: Array.prototype.slice.call(document.querySelectorAll('.speed-btn')),
  };

  var state = {
    notes: [], songId: null, songName: '', demo: false, bestStreak: 0,
    mode: 'audio', rate: 1, isPlaying: false, duration: 0,
    activeIndex: -1, raf: null, cardEls: [], objectUrl: null,
    synthCtx: null, synthNodes: [], synthStartCtxTime: 0, synthStartPos: 0, synthPos: 0,
  };

  // ---------------- helpers ----------------
  var toastTimer = null;
  function toast(msg, kind) {
    el.toast.textContent = msg;
    el.toast.className = 'toast ' + (kind || '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.add('hidden'); }, 4200);
  }
  function showLoading(text) {
    el.loadingText.textContent = text || 'מיכאל המלך מקשיב לשיר...';
    el.uploadSection.classList.add('hidden');
    el.results.classList.add('hidden');
    el.loading.classList.remove('hidden');
  }
  function hideLoading() { el.loading.classList.add('hidden'); }

  // ---------------- file upload ----------------
  function looksLikeAudio(file) {
    if (file.type && file.type.indexOf('audio') === 0) return true;
    return /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name || '');
  }

  function handleFile(file) {
    if (!file) return;
    if (!looksLikeAudio(file)) {
      toast('זה לא נראה כמו קובץ שיר 🎵 נסו MP3 או WAV.', 'err');
      return;
    }
    var objectUrl = URL.createObjectURL(file);
    showLoading('מיכאל המלך מקשיב לשיר... 🎧');
    var fd = new FormData();
    fd.append('file', file);
    api('/analyze', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          URL.revokeObjectURL(objectUrl);
          hideLoading();
          el.uploadSection.classList.remove('hidden');
          var msg = (res.data && res.data.message) ? res.data.message : 'משהו השתבש. ננסה שוב? 🎹';
          toast(msg, 'err');
          if (res.status === 503 && el.demoBtn.animate) {
            el.demoBtn.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
              { duration: 600, iterations: 3 }
            );
          }
          return;
        }
        loadSong(res.data, objectUrl);
        loadMySongs();
      })
      .catch(function () {
        URL.revokeObjectURL(objectUrl);
        hideLoading();
        el.uploadSection.classList.remove('hidden');
        toast('אופס, בעיה בחיבור לשרת. ננסה שוב? 🌐', 'err');
      });
  }

  function loadDemo() {
    showLoading('מכינים את שיר הדוגמה... 🌟');
    api('/demo').then(function (r) { return r.json(); })
      .then(function (data) { loadSong(data, null); })
      .catch(function () { hideLoading(); el.uploadSection.classList.remove('hidden'); toast('לא הצלחנו לטעון את הדוגמה 😅', 'err'); });
  }

  function loadSavedSong(id) {
    showLoading('טוענים שיר שמור... 🎼');
    api('/songs/' + id).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (!res.ok) { hideLoading(); el.uploadSection.classList.remove('hidden'); toast(res.d.message || 'השיר לא נמצא', 'err'); return; }
      loadSong(res.d, null);
    }).catch(function () { hideLoading(); el.uploadSection.classList.remove('hidden'); toast('שגיאה בטעינת השיר', 'err'); });
  }

  // ---------------- load + render ----------------
  function loadSong(data, objectUrl) {
    pause();
    stopHighlight();
    stopSynth();
    if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
    state.synthPos = 0; state.activeIndex = -1;

    state.notes = data.notes || [];
    state.songId = data.songId || null;
    state.songName = data.songName || 'שיר';
    state.demo = !!data.demo;
    state.bestStreak = data.bestStreak || 0;

    var maxEnd = state.notes.reduce(function (m, n) { return Math.max(m, n.endTime); }, 0);

    if (objectUrl) {
      state.mode = 'audio';
      state.objectUrl = objectUrl;
      el.audioEl.src = objectUrl;
      el.audioEl.load();
      state.duration = maxEnd;
    } else {
      state.mode = 'synth';
      el.audioEl.removeAttribute('src');
      state.duration = maxEnd;
    }

    el.songTitle.textContent = '🎶 ' + state.songName + (data.cached ? '  💾' : '');
    el.totTime.textContent = MK.fmtTime(state.duration);
    el.curTime.textContent = '0:00';
    updateProgress(0);

    renderCards();
    MKPiano.render(el.piano, state.notes);
    MKPiano.setActive([]);

    hideLoading();
    el.uploadSection.classList.add('hidden');
    el.results.classList.remove('hidden');
    el.playBtn.textContent = '▶️';
    setRate(state.rate); // מחיל את ההעדפה השמורה ומסמן את הכפתור
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCards() {
    el.notesStrip.innerHTML = '';
    state.cardEls = state.notes.map(function (n) {
      var c = document.createElement('div');
      c.className = 'note-card' + (MK.isSharp(n.noteName) ? ' sharp' : '');
      c.style.setProperty('--nc', MK.noteColor(n.noteName));
      var nm = document.createElement('div'); nm.className = 'nname'; nm.textContent = n.noteName;
      var oc = document.createElement('div'); oc.className = 'noct'; oc.textContent = 'אוקטבה ' + n.octave;
      c.appendChild(nm); c.appendChild(oc);
      c.addEventListener('click', function () { seek(n.startTime + 0.001); });
      el.notesStrip.appendChild(c);
      return c;
    });
  }

  // ---------------- player core ----------------
  function getTime() {
    if (state.mode === 'audio') return el.audioEl.currentTime || 0;
    if (state.isPlaying && state.synthCtx) {
      return state.synthStartPos + (state.synthCtx.currentTime - state.synthStartCtxTime) * state.rate;
    }
    return state.synthPos;
  }

  function play() {
    if (state.isPlaying || !state.notes.length) return;
    if (state.mode === 'audio') {
      if (el.audioEl.ended || el.audioEl.currentTime >= state.duration - 0.05) el.audioEl.currentTime = 0;
      el.audioEl.playbackRate = state.rate;
      applyPreservePitch();
      var p = el.audioEl.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      ensureCtx();
      if (state.synthCtx.state === 'suspended') state.synthCtx.resume();
      if (state.synthPos >= state.duration - 0.01) state.synthPos = 0;
      state.synthStartPos = state.synthPos;
      state.synthStartCtxTime = state.synthCtx.currentTime;
      scheduleSynth(state.synthPos);
    }
    state.isPlaying = true;
    el.playBtn.textContent = '⏸️';
    startHighlight();
  }

  function pause() {
    if (!state.isPlaying) return;
    if (state.mode === 'audio') {
      el.audioEl.pause();
    } else {
      state.synthPos = getTime();
      stopSynth();
    }
    state.isPlaying = false;
    el.playBtn.textContent = '▶️';
    stopHighlight();
  }

  function togglePlay() { if (state.isPlaying) pause(); else play(); }

  function seek(t) {
    t = Math.max(0, Math.min(t, state.duration || 0));
    if (state.mode === 'audio') {
      try { el.audioEl.currentTime = t; } catch (e) {}
    } else {
      state.synthPos = t;
      if (state.isPlaying) {
        stopSynth();
        state.synthStartPos = t;
        state.synthStartCtxTime = state.synthCtx.currentTime;
        scheduleSynth(t);
      }
    }
    updateProgress(t);
    updateActive(t);
  }

  function applyPreservePitch() {
    try { el.audioEl.preservesPitch = true; } catch (e) {}
    try { el.audioEl.mozPreservesPitch = true; } catch (e) {}
    try { el.audioEl.webkitPreservesPitch = true; } catch (e) {}
  }

  function setRate(r) {
    var cur = getTime();
    state.rate = r;
    el.speedBtns.forEach(function (b) { b.classList.toggle('active', parseFloat(b.dataset.rate) === r); });
    try { localStorage.setItem('mk_rate', String(r)); } catch (e) {}
    if (state.mode === 'audio') {
      el.audioEl.playbackRate = r;
      applyPreservePitch();
    } else if (state.isPlaying) {
      stopSynth();
      state.synthStartPos = cur;
      state.synthStartCtxTime = state.synthCtx.currentTime;
      scheduleSynth(cur);
    }
  }

  // ---------------- highlight loop ----------------
  function startHighlight() {
    if (state.raf) return;
    var loop = function () { tick(); state.raf = requestAnimationFrame(loop); };
    state.raf = requestAnimationFrame(loop);
  }
  function stopHighlight() { if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; } }

  function tick() {
    var t = getTime();
    updateProgress(t);
    updateActive(t);
    if (t >= state.duration - 0.001) {
      state.isPlaying = false;
      el.playBtn.textContent = '▶️';
      if (state.mode === 'synth') { stopSynth(); state.synthPos = state.duration; }
      stopHighlight();
      updateProgress(state.duration);
      updateActive(state.duration + 1); // מנקה הדגשות בסוף
    }
  }

  function updateProgress(t) {
    var d = state.duration || 1;
    var pct = Math.max(0, Math.min(100, (t / d) * 100));
    el.progressFill.style.width = pct + '%';
    el.progressKnob.style.right = pct + '%';
    el.curTime.textContent = MK.fmtTime(Math.min(t, d));
  }

  function updateActive(t) {
    var active = [];
    var currentIdx = -1;
    for (var i = 0; i < state.notes.length; i++) {
      var n = state.notes[i];
      if (t >= n.startTime && t < n.endTime) { active.push(n.midi); currentIdx = i; }
    }
    MKPiano.setActive(active);

    if (currentIdx !== state.activeIndex) {
      state.cardEls.forEach(function (c, i) { if (i !== currentIdx) c.classList.remove('active'); });
      if (currentIdx >= 0 && state.cardEls[currentIdx]) {
        state.cardEls[currentIdx].classList.add('active');
        state.cardEls[currentIdx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      state.activeIndex = currentIdx;
    }
  }

  function onProgressClick(e) {
    var rect = el.progress.getBoundingClientRect();
    var fromRight = rect.right - e.clientX; // RTL: ציר הזמן זורם מימין לשמאל
    var frac = Math.max(0, Math.min(1, fromRight / rect.width));
    seek(frac * state.duration);
  }

  // ---------------- synth (Web Audio) ----------------
  // "מחמם" את מנוע האודיו בתוך מחווה של המשתמש (חשוב ל-iOS, ששם הקול חסום עד מגע).
  function primeAudio() {
    try {
      ensureCtx();
      if (state.synthCtx && state.synthCtx.state === 'suspended') state.synthCtx.resume();
    } catch (e) {}
  }

  function ensureCtx() {
    if (!state.synthCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      state.synthCtx = new AC();
    }
  }
  function stopSynth() {
    state.synthNodes.forEach(function (node) {
      try { node.osc.stop(); } catch (e) {}
      try { node.osc.disconnect(); node.gain.disconnect(); } catch (e) {}
    });
    state.synthNodes = [];
  }
  function scheduleSynth(fromPos) {
    stopSynth();
    var ctx = state.synthCtx;
    var now = ctx.currentTime;
    state.notes.forEach(function (n) {
      if (n.endTime <= fromPos) return;
      var startRel = Math.max(0, (n.startTime - fromPos) / state.rate);
      var endRel = (n.endTime - fromPos) / state.rate;
      var dur = Math.max(0.06, endRel - startRel);
      var startAt = now + startRel;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = MK.freqFromMidi(n.midi);
      var peak = 0.18;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
      var holdUntil = Math.max(startAt + 0.03, startAt + dur - 0.06);
      gain.gain.setValueAtTime(peak, holdUntil);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.03);
      state.synthNodes.push({ osc: osc, gain: gain });
    });
  }

  // ---------------- my songs ----------------
  function loadMySongs() {
    api('/songs').then(function (r) { return r.json(); }).then(function (d) {
      var songs = d.songs || [];
      el.songsList.innerHTML = '';
      el.noSongs.classList.toggle('hidden', songs.length > 0);
      songs.forEach(function (s) {
        var item = document.createElement('div'); item.className = 'song-item';
        var emoji = document.createElement('span'); emoji.className = 'si-emoji'; emoji.textContent = '🎵';
        var main = document.createElement('div'); main.className = 'si-main';
        var nm = document.createElement('div'); nm.className = 'si-name'; nm.textContent = s.songName;
        var meta = document.createElement('div'); meta.className = 'si-meta';
        meta.textContent = s.noteCount + ' תווים' + (s.bestStreak ? ' · שיא: ' + s.bestStreak + ' 🏆' : '');
        main.appendChild(nm); main.appendChild(meta);
        var openB = document.createElement('button'); openB.className = 'btn btn-small si-open'; openB.textContent = '▶️ פתחו';
        openB.onclick = function () { loadSavedSong(s.id); };
        var delB = document.createElement('button'); delB.className = 'btn btn-small si-del'; delB.textContent = '🗑️';
        delB.onclick = function () { deleteSong(s.id, s.songName); };
        item.appendChild(emoji); item.appendChild(main); item.appendChild(openB); item.appendChild(delB);
        el.songsList.appendChild(item);
      });
    }).catch(function () {});
  }

  function deleteSong(id, name) {
    if (!window.confirm('למחוק את "' + name + '"?')) return;
    api('/songs/' + id, { method: 'DELETE' }).then(function () {
      loadMySongs();
      toast('השיר נמחק', 'ok');
    }).catch(function () { toast('לא הצלחנו למחוק', 'err'); });
  }

  function resetToUpload() {
    pause(); stopHighlight(); stopSynth();
    el.results.classList.add('hidden');
    el.uploadSection.classList.remove('hidden');
    el.uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------- init ----------------
  function init() {
    try { var r = parseFloat(localStorage.getItem('mk_rate')); if (r) state.rate = r; } catch (e) {}
    try { if (localStorage.getItem('mk_notice_dismissed') === '1') el.accuracyNotice.classList.add('hidden'); } catch (e) {}
    el.speedBtns.forEach(function (b) { b.classList.toggle('active', parseFloat(b.dataset.rate) === state.rate); });

    el.chooseBtn.addEventListener('click', function (e) { e.stopPropagation(); el.fileInput.click(); });
    el.dropZone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropZone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); } });
    el.fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      el.dropZone.addEventListener(ev, function (e) { e.preventDefault(); el.dropZone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.dropZone.addEventListener(ev, function (e) { e.preventDefault(); el.dropZone.classList.remove('drag'); });
    });
    el.dropZone.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    el.demoBtn.addEventListener('click', loadDemo);
    el.noticeClose.addEventListener('click', function () {
      el.accuracyNotice.classList.add('hidden');
      try { localStorage.setItem('mk_notice_dismissed', '1'); } catch (e) {}
    });

    el.playBtn.addEventListener('click', togglePlay);
    el.restartBtn.addEventListener('click', function () { seek(0); if (!state.isPlaying) play(); });
    el.speedBtns.forEach(function (b) { b.addEventListener('click', function () { setRate(parseFloat(b.dataset.rate)); }); });
    el.progress.addEventListener('click', onProgressClick);
    el.uploadAnotherBtn.addEventListener('click', resetToUpload);
    el.gameBtn.addEventListener('click', function () {
      pause();
      MKGame.start({ notes: state.notes, songId: state.demo ? null : state.songId, songName: state.songName, demo: state.demo });
    });

    el.audioEl.addEventListener('loadedmetadata', function () {
      if (state.mode === 'audio') {
        var d = el.audioEl.duration;
        if (isFinite(d) && d > 0) state.duration = d;
        el.totTime.textContent = MK.fmtTime(state.duration);
      }
    });
    el.audioEl.addEventListener('ended', function () {
      state.isPlaying = false; el.playBtn.textContent = '▶️';
      stopHighlight(); updateProgress(state.duration); updateActive(state.duration + 1);
    });

    // מסך הפתיחה: לחיצה על "בוא נשחק" מפעילה את האודיו (ל-iOS) ומסתירה את המסך.
    if (el.startBtn) {
      el.startBtn.addEventListener('click', function () {
        primeAudio();
        if (el.welcome) {
          el.welcome.classList.add('fade');
          setTimeout(function () { el.welcome.classList.add('hidden'); }, 500);
        }
      });
    }

    loadMySongs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
