"""
לקוח ל-Klangio Transcription API.

זרימת העבודה (אסינכרונית, מבוססת polling):
  1. POST https://api.klang.io/transcription   -> מחזיר job_id
  2. GET  https://api.klang.io/job/{id}/status  -> IN_QUEUE / IN_PROGRESS / COMPLETED / FAILED
  3. GET  https://api.klang.io/job/{id}/midi    -> קובץ MIDI עם התווים

מסמכים: https://api-docs.klang.io/docs/getting-started/basic-job-workflow
"""
import io
import time

import mido
import requests

KLANGIO_BASE = "https://api.klang.io"


class KlangioError(Exception):
    """שגיאה שמקורה באינטגרציה עם Klangio. ה-code עוזר להחזיר הודעה ידידותית."""

    def __init__(self, code, detail=""):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


def transcribe(file_bytes, filename, api_key, model="piano",
               poll_interval=2.0, timeout=180):
    """
    שולח קובץ אודיו ל-Klangio ומחזיר את בייטי ה-MIDI של התמלול.
    זורק KlangioError במקרה של בעיה.
    """
    if not api_key:
        raise KlangioError("NO_API_KEY")

    # --- שלב 1: יצירת job ---
    try:
        resp = requests.post(
            f"{KLANGIO_BASE}/transcription",
            headers={"kl-api-key": api_key},
            params={"model": model, "title": filename},
            data={"outputs": ["midi"]},  # אנחנו צריכים נתונים גולמיים, לא PDF
            files={"file": (filename, io.BytesIO(file_bytes))},
            timeout=60,
        )
    except requests.RequestException as e:
        raise KlangioError("NETWORK", str(e))

    if resp.status_code in (401, 403):
        raise KlangioError("BAD_KEY", resp.text[:300])
    if resp.status_code == 402:
        raise KlangioError("QUOTA", resp.text[:300])
    if resp.status_code != 200:
        raise KlangioError("CREATE_FAILED", f"{resp.status_code} {resp.text[:300]}")

    job = resp.json()
    job_id = job.get("job_id")
    if not job_id:
        raise KlangioError("NO_JOB_ID", str(job)[:300])

    # --- שלב 2: polling על הסטטוס ---
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            s = requests.get(
                f"{KLANGIO_BASE}/job/{job_id}/status",
                headers={"kl-api-key": api_key},
                timeout=30,
            )
        except requests.RequestException as e:
            raise KlangioError("NETWORK", str(e))

        status = s.json().get("status") if s.status_code == 200 else None
        if status == "COMPLETED":
            break
        if status == "FAILED":
            raise KlangioError("JOB_FAILED", s.text[:300])
        time.sleep(poll_interval)
    else:
        raise KlangioError("TIMEOUT")

    # --- שלב 3: שליפת ה-MIDI ---
    try:
        m = requests.get(
            f"{KLANGIO_BASE}/job/{job_id}/midi",
            headers={"kl-api-key": api_key},
            timeout=60,
        )
    except requests.RequestException as e:
        raise KlangioError("NETWORK", str(e))

    if m.status_code != 200:
        raise KlangioError("FETCH_FAILED", f"{m.status_code} {m.text[:200]}")

    return m.content


def midi_to_notes(midi_bytes):
    """
    ממיר בייטים של קובץ MIDI לרשימת תווים: [{midi, startTime, endTime}, ...]
    הזמנים בשניות. mido מבצע אוטומטית את המרת הטמפו (ticks -> שניות)
    כשמבצעים iterate ישירות על אובייקט ה-MidiFile.
    """
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))

    abs_time = 0.0
    active = {}   # midi pitch -> רשימת זמני התחלה פתוחים (לטיפול בתווים חופפים)
    notes = []

    for msg in mid:
        abs_time += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            active.setdefault(msg.note, []).append(abs_time)
        elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
            starts = active.get(msg.note)
            if starts:
                start = starts.pop(0)
                notes.append(
                    {
                        "midi": msg.note,
                        "startTime": round(start, 3),
                        "endTime": round(abs_time, 3),
                    }
                )

    notes.sort(key=lambda n: (n["startTime"], n["midi"]))
    return notes


# הודעות ידידותיות למשתמש הסופי (ילד) לפי קוד השגיאה.
FRIENDLY_MESSAGES = {
    "NO_API_KEY": "עדיין לא הוגדר מפתח Klangio בשרת. בינתיים אפשר לנגן את שיר הדוגמה! 🌟",
    "BAD_KEY": "יש בעיה במפתח של מיכאל המלך. צריך לבדוק את ההגדרות. 🔑",
    "QUOTA": "מיכאל המלך עייף לרגע (נגמרה המכסה היומית). ננסה שוב מאוחר יותר. 😴",
    "NETWORK": "מיכאל המלך לא הצליח להתחבר כרגע. בדקו את האינטרנט ונסו שוב. 🌐",
    "TIMEOUT": "השיר הזה ארוך מדי בשביל מיכאל המלך. נסו קטע קצר יותר. ⏱️",
    "JOB_FAILED": "מיכאל המלך לא הצליח לשמוע מנגינה ברורה בקובץ הזה. ננסה שיר אחר? 🎵",
    "FETCH_FAILED": "משהו השתבש בקבלת התווים. ננסה שוב? 🎶",
    "CREATE_FAILED": "מיכאל המלך לא הצליח להתחיל להאזין לשיר. ננסה שוב? 🎼",
}


def friendly_message(code):
    return FRIENDLY_MESSAGES.get(
        code, "אופס! משהו קטן השתבש. ננסה שוב או נבחר שיר אחר. 🎹"
    )
