"""
המרת תווים מהשיטה האנגלית (C, D, E...) לשיטה העברית/לטינית המקובלת בישראל:
דו, רה, מי, פה, סול, לה, סי.

תקן MIDI: התו C4 (דו) = מספר 60.
חישוב אוקטבה: octave = pitch // 12 - 1
חישוב מחלקת-גובה: pc = pitch % 12
"""

# 12 הצלילים בכרומטיות, החל מ-C. תווי דיאז (#) הם המקשים השחורים.
HEBREW = ["דו", "דו#", "רה", "רה#", "מי", "פה", "פה#", "סול", "סול#", "לה", "לה#", "סי"]
ENGLISH = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pitch_to_hebrew(pitch):
    """מקבל מספר MIDI ומחזיר (שם עברי, אוקטבה, שם אנגלי)."""
    pc = pitch % 12
    octave = pitch // 12 - 1
    return HEBREW[pc], octave, ENGLISH[pc]


def enrich(raw_notes):
    """
    מקבל רשימת תווים גולמית [{midi, startTime, endTime}, ...]
    ומחזיר רשימה מועשרת עם שם התו בעברית והאוקטבה:
    [{noteName, english, octave, midi, startTime, endTime}, ...]
    """
    out = []
    for n in raw_notes:
        name, octave, eng = pitch_to_hebrew(n["midi"])
        out.append(
            {
                "noteName": name,
                "english": eng,
                "octave": octave,
                "midi": n["midi"],
                "startTime": n["startTime"],
                "endTime": n["endTime"],
            }
        )
    return out
