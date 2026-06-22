/*
 * game.js - מצב משחק "נגנו אחריי" (זיהוי מיקרופון בזמן אמת, בצד הדפדפן).
 *
 * שיפורי דיוק חשובים:
 *  1. מבטלים עיבוד אודיו של הדפדפן (echoCancellation/noiseSuppression/autoGainControl)
 *     — הם מעוותים צליל מוזיקלי וגורמים לזיהוי גרוע, במיוחד בנייד.
 *  2. מפעילים AudioContext.resume() — ב-iOS מנוע הקול מתחיל "מושהה" עד מגע.
 *  3. אלגוריתם NSDF (McLeod) מוגבל לטווח מוזיקלי — יציב ועמיד לטעויות אוקטבה.
 *  4. התאמה סלחנית: התו הנכון נספר אם הופיע כמה פעמים בחלון קצר (לא חייב ברצף מושלם).
 *     ההשוואה לפי *שם התו* בלבד (בלי תלות באוקטבה) — ידידותי לילד.
 */
window.MKGame = (function () {
  var ctx, analyser, micStream, rafId, buf;
  var targets = [], idx = 0, streak = 0, best = 0, correct = 0, total = 0;
  var opts = null, locked = false, recent = [];
  var overlay = document.getElementById('gameOverlay');

  function start(o) {
    opts = o || {};
    buildTargets(opts.notes);
    if (!targets.length) return;
    idx = 0; streak = 0; best = 0; correct = 0; total = targets.length; locked = false; recent = [];
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
      if (key !== prev && !MK.isSharp(n.noteName)) {
        targets.push({ noteName: n.noteName, octave: n.octave, midi: n.midi });
        prev = key;
      }
    });
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

    var listen = document.createElement('div');
    listen.className = 'game-listen'; listen.id = 'gameListen';
    listen.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';
    listen.style.visibility = 'hidden';

    overlay.appendChild(exit);
    overlay.appendChild(h);
    overlay.appendChild(target);
    overlay.appendChild(prog);
    overlay.appendChild(streakEl);
    overlay.appendChild(listen);
    overlay.appendChild(fb);
    overlay.appendChild(heard);
    showTarget();
  }

  function showTarget() {
    var t = targets[idx];
    var tEl = document.getElementById('gameTarget');
    tEl.style.setProperty('--nc', MK.noteColor(t.noteName));
    tEl.classList.remove('hit');
    tEl.innerHTML = '<div class="gname">' + t.noteName + '</div><div class="goct">אוקטבה ' + t.octave + '</div>';
    document.getElementById('gameProg').textContent = 'תו ' + (idx + 1) + ' מתוך ' + targets.length;
    document.getElementById('gameStreak').textContent = '🔥 רצף: ' + streak;
    document.getElementById('gameFb').textContent = '';
    document.getElementById('gameHeard').textContent = '';
    locked = false; recent = [];
  }

  function requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      noMic('הדפדפן הזה לא תומך במיקרופון 🎤 אבל תמיד אפשר פשוט להאזין לשיר ולעקוב אחרי התווים!');
      return;
    }
    // ביטול עיבוד האודיו של הדפדפן — קריטי לזיהוי תווים נקי (בעיקר בנייד).
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    }).then(function (stream) {
      micStream = stream;
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      var lst = document.getElementById('gameListen');
      if (lst) lst.style.visibility = 'visible';
      listen();
    }).catch(function () {
      noMic('כדי לשחק צריך לאשר את המיקרופון 🎤 אפשר גם פשוט להאזין לשיר ולעקוב אחרי התווים!');
    });
  }

  function noMic(msg) {
    overlay.innerHTML = '';
    var box = document.createElement('div');
    box.innerHTML = '<div style="font-size:60px">🎤</div><p style="max-width:440px;font-size:19px">' + msg + '</p>';
    var b = document.createElement('button');
    b.className = 'btn game-bigbtn';
    b.textContent = 'חזרה לשיר';
    b.onclick = stop;
    overlay.appendChild(box);
    overlay.appendChild(b);
  }

  function listen() {
    analyser.getFloatTimeDomainData(buf);
    var freq = detectPitch(buf, ctx.sampleRate);
    if (freq > 0 && !locked) {
      var midi = Math.round(69 + 12 * Math.log2(freq / 440));
      var det = MK.nameFromMidi(midi);
      var heardEl = document.getElementById('gameHeard');
      if (heardEl) heardEl.textContent = 'שומע: ' + det.name;

      recent.push(det.name);
      if (recent.length > 12) recent.shift();
      var hits = 0;
      for (var k = 0; k < recent.length; k++) {
        if (recent[k] === targets[idx].noteName) hits++;
      }
      if (hits >= 3) success();
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
        body: JSON.stringify({ streak: best })
      }).catch(function () {});
    }
    overlay.innerHTML = '';
    var box = document.createElement('div');
    box.innerHTML =
      '<div style="font-size:80px">👑</div>' +
      '<h2>המלך מיכאל גאה בך!</h2>' +
      '<p style="font-size:23px">פגעת ב-' + correct + ' מתוך ' + total + ' תווים 🎉</p>' +
      '<p style="font-size:19px">🔥 הרצף הכי טוב: ' + best + '</p>';
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

  /*
   * זיהוי גובה צליל יציב מבוסס NSDF (Normalized Square Difference, שיטת McLeod),
   * מוגבל לטווח התדרים המוזיקלי (לביצועים ולעמידות). מחזיר תדר ב-Hz, או -1 אם אין צליל ברור.
   */
  function detectPitch(buffer, sampleRate) {
    var SIZE = buffer.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.006) return -1; // שקט מדי

    var minFreq = 75, maxFreq = 1350;
    var maxLag = Math.min(SIZE - 2, Math.floor(sampleRate / minFreq));
    var minLag = Math.max(2, Math.floor(sampleRate / maxFreq));

    var bestLag = -1, bestVal = 0;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var acf = 0, norm = 0;
      for (var j = 0; j < SIZE - lag; j++) {
        var a = buffer[j], b = buffer[j + lag];
        acf += a * b;
        norm += a * a + b * b;
      }
      var nsdf = norm > 0 ? (2 * acf / norm) : 0;
      if (nsdf > bestVal) { bestVal = nsdf; bestLag = lag; }
    }
    if (bestLag < 0 || bestVal < 0.4) return -1; // לא מספיק מחזורי -> כנראה רעש
    return sampleRate / bestLag;
  }

  return { start: start, stop: stop };
})();
