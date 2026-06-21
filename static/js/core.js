/*
 * core.js - קבועים ופונקציות עזר משותפים.
 * נטען ראשון ומגדיר את window.MK לשימוש שאר הקבצים.
 */
window.MK = (function () {
  // צבעי הקשת לשבעת התווים הטבעיים (מקשים לבנים) - עוזר לילד לזכור לפי צבע.
  const COLORS = {
    'דו':  '#FF5A5F', // אדום
    'רה':  '#FF9F1C', // כתום
    'מי':  '#FFD23F', // צהוב
    'פה':  '#3DDC84', // ירוק
    'סול': '#4CC9F0', // תכלת
    'לה':  '#4361EE', // כחול
    'סי':  '#9D4EDD', // סגול
  };
  const SHARP_COLOR = '#3A3A55'; // מקשים שחורים (דיאז)

  // סדר המקשים הלבנים באוקטבה: דו רה מי פה סול לה סי
  const WHITE_ORDER = ['דו', 'רה', 'מי', 'פה', 'סול', 'לה', 'סי'];
  // כל 12 הצלילים הכרומטיים החל מ-C
  const HEBREW = ['דו', 'דו#', 'רה', 'רה#', 'מי', 'פה', 'פה#', 'סול', 'סול#', 'לה', 'לה#', 'סי'];
  // לאחר אילו מקשים לבנים יש מקש שחור
  const HAS_SHARP_AFTER = new Set(['דו', 'רה', 'פה', 'סול', 'לה']);

  function isSharp(name) { return name && name.indexOf('#') !== -1; }

  function noteColor(name) {
    return isSharp(name) ? SHARP_COLOR : (COLORS[name] || '#9aa0b5');
  }

  function freqFromMidi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function nameFromMidi(m) {
    const pc = ((m % 12) + 12) % 12;
    const octave = Math.floor(m / 12) - 1;
    return { name: HEBREW[pc], octave: octave };
  }

  function midiFromName(name, octave) {
    const pc = HEBREW.indexOf(name);
    if (pc < 0) return null;
    return (octave + 1) * 12 + pc;
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  return {
    COLORS, SHARP_COLOR, WHITE_ORDER, HEBREW, HAS_SHARP_AFTER,
    isSharp, noteColor, freqFromMidi, nameFromMidi, midiFromName, fmtTime,
  };
})();
