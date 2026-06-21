/*
 * piano.js - ציור מקלדת פסנתר גרפית (div-ים בעיצוב CSS, בלי תמונה חיצונית).
 * המקשים הלבנים נצבעים בצבע של התו (אותם צבעי קשת כמו הכרטיסיות),
 * וכשתו מתנגן המקש המתאים "נלחץ" ומקבל זוהר.
 */
window.MKPiano = (function () {
  let keyEls = {}; // midi -> element

  function render(container, notes) {
    container.innerHTML = '';
    keyEls = {};
    if (!notes || !notes.length) return;

    let minMidi = Infinity, maxMidi = -Infinity;
    notes.forEach(function (n) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    });

    var octMin = Math.floor(minMidi / 12) - 1;
    var octMax = Math.floor(maxMidi / 12) - 1;
    // לפחות אוקטבה אחת; הגבלה ל-5 אוקטבות כדי שלא יהיה ענק
    if (octMax < octMin) octMax = octMin;
    if (octMax - octMin > 4) octMax = octMin + 4;

    var inner = document.createElement('div');
    inner.className = 'piano-inner';

    // רשימת המקשים הלבנים לפי אוקטבות
    var whites = [];
    for (var oct = octMin; oct <= octMax; oct++) {
      MK.WHITE_ORDER.forEach(function (name) {
        whites.push({ midi: MK.midiFromName(name, oct), name: name, octave: oct });
      });
    }
    var N = whites.length;

    // מקשים לבנים
    whites.forEach(function (w) {
      var wk = document.createElement('div');
      wk.className = 'white-key';
      wk.dataset.midi = w.midi;

      var dot = document.createElement('div');
      dot.className = 'wdot';
      dot.style.background = MK.noteColor(w.name);

      var lbl = document.createElement('div');
      lbl.className = 'wlabel';
      lbl.textContent = w.name;

      wk.appendChild(dot);
      wk.appendChild(lbl);
      inner.appendChild(wk);
      keyEls[w.midi] = wk;
    });

    // מקשים שחורים (ממוקמים אבסולוטית על הגבול בין מקשים לבנים)
    whites.forEach(function (w, i) {
      if (MK.HAS_SHARP_AFTER.has(w.name) && i < N - 1) {
        var bMidi = w.midi + 1;
        var bk = document.createElement('div');
        bk.className = 'black-key';
        bk.dataset.midi = bMidi;
        bk.style.left = ((i + 1) / N) * 100 + '%';
        inner.appendChild(bk);
        keyEls[bMidi] = bk;
      }
    });

    container.appendChild(inner);
  }

  function setActive(midiList) {
    var set = {};
    (midiList || []).forEach(function (m) { set[m] = true; });
    for (var midi in keyEls) {
      if (Object.prototype.hasOwnProperty.call(keyEls, midi)) {
        keyEls[midi].classList.toggle('pressed', !!set[midi]);
      }
    }
  }

  return { render: render, setActive: setActive };
})();
