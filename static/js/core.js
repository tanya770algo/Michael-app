/*
 * core.js - קבועים ופונקציות עזר משותפים.
 * נטען ראשון ומגדיר את window.MK לשימוש שאר הקבצים.
 * פלטה: "אלקטרו-מוזיקלי" כהה עם מנטה וזהב (בוגר יותר, פחות צבעוני).
 */
window.MK = (function () {
  // צבעי תווים בפלטה אלקטרונית מגובשת (מנטה + זהב + גוונים קרים), על רקע כהה.
  // שם התו (דו/רה/מי...) הוא המזהה העיקרי; הצבע הוא רמז משני ועדין.
  const COLORS = {
    'דו':  '#E9C46A', // זהב
    'רה':  '#F4A15D', // ענבר
    'מי':  '#6EE7B7', // מנטה בהירה
    'פה':  '#34E7C8', // מנטה חשמלית (צבע החתימה)
    'סול': '#38BDF8', // תכלת חשמלי
    'לה':  '#818CF8', // אינדיגו
    'סי':  '#C084FC', // סגול-ניאון
  };
  const SHARP_COLOR = '#26303d'; // מקשים שחורים (דיאז) - כהה עם מסגרת מנטה ב-CSS

  const WHITE_ORDER = ['דו', 'רה', 'מי', 'פה', 'סול', 'לה', 'סי'];
  const HEBREW = ['דו', 'דו#', 'רה', 'רה#', 'מי', 'פה', 'פה#', 'סול', 'סול#', 'לה', 'לה#', 'סי'];
  const HAS_SHARP_AFTER = new Set(['דו', 'רה', 'פה', 'סול', 'לה']);

  function isSharp(name) { return name && name.indexOf('#') !== -1; }
  function noteColor(name) { return isSharp(name) ? SHARP_COLOR : (COLORS[name] || '#9aa0b5'); }
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
