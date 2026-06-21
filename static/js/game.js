/*
 * game.js - מצב משחק "נגנו אחריי".
 * זיהוי גובה הצליל מהמיקרופון קורה כולו בצד הדפדפן (autocorrelation),
 * כי זיהוי בזמן אמת חייב להיות מקומי - אי אפשר לשלוח כל רגע לשרת בלי השהיה.
 * ההשוואה לתו המבוקש היא לפי *שם התו* (בלי תלות באוקטבה) - ידידותי לילד מתחיל.
 */
window.MKGame = (function () {
  var ctx, analyser, micStream, rafId, buf;
  var targets = [], idx = 0, streak = 0, best = 0, correct = 0, total = 0;
  var opts = null, stableCount = 0, locked = false;
  var overlay = document.getElementById('gameOverlay');

  function start(o) {
    opts = o || {};
    buildTargets(opts.notes);
    if (!targets.length) { return; }
    idx = 0; streak = 0; best = 0; correct = 0; total = targets.length; locked = false;
    renderGameUI();
    overlay.classList.remove('hidden');
    requestMic();
  }

  function buildTargets(notes) {
    targets = [];
    var prev = null;
    (notes || []).forEach(function (n) {
      if (targets.length >= 12) return;
      var key = n.noteName + n.octave;
      if (key !== prev && !MK.isSharp(n.noteName)) { // נתמקד בתווים טבעיים למשחק
        targets.push({ noteName: n.noteName, octave: n.octave, midi: n.midi });
        prev = key;
      }
    });
    // אם כל התווים היו דיאזים (נדיר), ניקח גם אותם
    if (!targets.length) {
      prev = null;
      (notes || []).forEach(function (n) {
        if (targets.length >= 12) return;
        var key = n.noteName + n.octave;
        if (key !== prev) { targets.push({ noteName: n.noteName, octave: n.octave, midi: n.midi }); prev = key; }
      });
    }
  }

  function renderGameUI() {
    overlay.innerHTML = '';
    var exit = document.createElement('button');
    exit.className = 'btn btn-small game-exit';
    exit.textContent = '✕ יציאה';
    exit.onclick = stop;

    var h = document.createElement('h2');
    h.textContent = 'נגנו את התו הזה בפסנתר 🎹';

    var target = document.createElement('div');
    target.className = 'game-target'; target.id = 'gameTarget';

    var prog = document.createElement('div'); prog.className = 'game-progress'; prog.id = 'gameProg';
    var streakEl = document.createElement('div'); streakEl.className = 'game-streak'; streakEl.id = 'gameStreak';
    var fb = document.createElement('div'); fb.className = 'game-feedback'; fb.id = 'gameFb';
    var heard = document.createElement('div'); heard.className = 'game-heard'; heard.id = 'gameHeard';

    overlay.appendChild(exit);
    overlay.appendChild(h);
    overlay.appendChild(target);
    overlay.appendChild(prog);
    overlay.appendChild(streakEl);
    overlay.appendChild(fb);
    overlay.appendChild(heard);
    showTarget();
  }

  function showTarget() {
    var t = targets[idx];
    var tEl = document.getElementById('gameTarget');
    tEl.style.background = MK.noteColor(t.noteName);
    tEl.classList.remove('hit');
    tEl.innerHTML = '<div class="gname">' + t.noteName + '</div><div class="goct">אוקטבה ' + t.octave + '</div>';
    document.getElementById('gameProg').textContent = 'תו ' + (idx + 1) + ' מתוך ' + targets.length;
    document.getElementById('gameStreak').textContent = '🔥 רצף: ' + streak;
    document.getElementById('gameFb').textContent = '';
    document.getElementById('gameHeard').textContent = '';
    stableCount = 0; locked = false;
  }

  function requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      noMic('הדפדפן הזה לא תומך במיקרופון 🎤 אבל אפשר תמיד פשוט להאזין לשיר ולעקוב אחרי התווים!');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      micStream = stream;
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      var src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      listen();
    }).catch(function () {
      noMic('כדי לשחק צריך לאשר את המיקרופון 🎤 אפשר גם פשוט להאזין לשיר ולעקוב אחרי התווים!');
    });
  }

  function noMic(msg) {
    overlay.innerHTML = '';
    var box = document.createElement('div');
    box.innerHTML = '<div style="font-size:64px">🎤</div><p style="max-width:440px;font-size:20px">' + msg + '</p>';
    var b = document.createElement('button');
    b.className = 'btn game-bigbtn';
    b.textContent = 'חזרה לשיר';
    b.onclick = stop;
    overlay.appendChild(box);
    overlay.appendChild(b);
  }

  function listen() {
    analyser.getFloatTimeDomainData(buf);
    var freq = autoCorrelate(buf, ctx.sampleRate);
    if (freq > 0 && !locked) {
      var midi = Math.round(69 + 12 * Math.log2(freq / 440));
      var det = MK.nameFromMidi(midi);
      var heardEl = document.getElementById('gameHeard');
      if (heardEl) heardEl.textContent = 'שומע: ' + det.name;
      if (det.name === targets[idx].noteName) {
        stableCount++;
        if (stableCount >= 3) success();
      } else {
        stableCount = 0;
      }
    }
    rafId = requestAnimationFrame(listen);
  }

  function success() {
    locked = true;
    correct++; streak++; best = Math.max(best, streak);
    var tEl = document.getElementById('gameTarget');
    if (tEl) tEl.classList.add('hit');
    document.getElementById('gameFb').textContent = 'כל הכבוד! ✅🎉';
    document.getElementById('gameStreak').textContent = '🔥 רצף: ' + streak;
    confetti();
    setTimeout(function () {
      idx++;
      if (idx >= targets.length) finish();
      else showTarget();
    }, 950);
  }

  function finish() {
    if (rafId) cancelAnimationFrame(rafId);
    if (opts.songId) {
      fetch('/api/michael-king/songs/' + opts.songId + '/streak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streak: best }),
      }).catch(function () {});
    }
    overlay.innerHTML = '';
    var box = document.createElement('div');
    box.innerHTML =
      '<div style="font-size:84px">👑</div>' +
      '<h2>המלך מיכאל גאה בך!</h2>' +
      '<p style="font-size:24px">פגעת ב-' + correct + ' מתוך ' + total + ' תווים 🎉</p>' +
      '<p style="font-size:20px">🔥 הרצף הכי טוב: ' + best + '</p>';
    var again = document.createElement('button');
    again.className = 'btn game-bigbtn';
    again.textContent = '🎮 עוד פעם';
    again.onclick = function () { start(opts); };
    var out = document.createElement('button');
    out.className = 'btn btn-small';
    out.textContent = '✕ סיום';
    out.onclick = stop;
    overlay.appendChild(box);
    overlay.appendChild(again);
    overlay.appendChild(out);
    stopMicOnly();
  }

  function stopMicOnly() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    if (ctx) { ctx.close().catch(function () {}); ctx = null; }
  }

  function stop() {
    stopMicOnly();
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }

  function confetti() {
    var emojis = ['🎉', '⭐', '🎵', '✨', '🌟', '🎶'];
    for (var i = 0; i < 14; i++) {
      var c = document.createElement('div');
      c.className = 'confetti-piece';
      c.textContent = emojis[i % emojis.length];
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(c);
      (function (node) { setTimeout(function () { node.remove(); }, 1800); })(c);
    }
  }

  // אלגוריתם autocorrelation סטנדרטי לזיהוי גובה צליל (מבוסס על Chris Wilson, MIT).
  function autoCorrelate(buffer, sampleRate) {
    var SIZE = buffer.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) { var v = buffer[i]; rms += v * v; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // שקט - אין צליל ברור

    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (var i1 = 0; i1 < SIZE / 2; i1++) { if (Math.abs(buffer[i1]) < thres) { r1 = i1; break; } }
    for (var i2 = 1; i2 < SIZE / 2; i2++) { if (Math.abs(buffer[SIZE - i2]) < thres) { r2 = SIZE - i2; break; } }

    var buf2 = buffer.slice(r1, r2);
    var SIZE2 = buf2.length;
    var c = new Array(SIZE2).fill(0);
    for (var i3 = 0; i3 < SIZE2; i3++) {
      for (var j = 0; j < SIZE2 - i3; j++) { c[i3] += buf2[j] * buf2[j + i3]; }
    }

    var d = 0; while (d < SIZE2 - 1 && c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var i4 = d; i4 < SIZE2; i4++) { if (c[i4] > maxval) { maxval = c[i4]; maxpos = i4; } }
    if (maxpos <= 0) return -1;

    var T0 = maxpos;
    var x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    var a = (x1 + x3 - 2 * x2) / 2;
    var b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  return { start: start, stop: stop };
})();
