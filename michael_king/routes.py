"""
ה-routes של הפיצ'ר, תחת /api/michael-king/.

  POST   /api/michael-king/analyze          - מקבל MP3, מנתח דרך Klangio, שומר ומחזיר תווים
  GET    /api/michael-king/songs            - רשימת השירים השמורים
  GET    /api/michael-king/songs/<id>       - שיר שמור בודד (טעינה בלי ניתוח מחדש)
  DELETE /api/michael-king/songs/<id>       - מחיקת שיר
  POST   /api/michael-king/songs/<id>/streak- שמירת שיא רצף ממצב המשחק
  GET    /api/michael-king/demo             - שיר דוגמה מובנה (ללא Klangio)
"""
import hashlib
import json

from flask import Blueprint, current_app, jsonify, request

from michael_king import db, demo_data, klangio
from michael_king import notes as notes_mod

bp = Blueprint("michael_king", __name__, url_prefix="/api/michael-king")

# גודל קובץ מינימלי סביר (כדי לפסול קבצים ריקים/פגומים)
MIN_FILE_BYTES = 1024


@bp.route("/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify(error="no_file", message="לא נבחר קובץ MP3. 🎵"), 400

    f = request.files["file"]
    data = f.read()
    if not data or len(data) < MIN_FILE_BYTES:
        return jsonify(error="empty", message="הקובץ ריק או קטן מדי. נסו קובץ אחר. 🎵"), 400

    filename = f.filename or "שיר.mp3"
    song_name = filename.rsplit(".", 1)[0] or "שיר"

    # --- caching לפי hash: אם כבר ניתח קובץ זהה, מחזירים מיד בלי לשלם שוב ל-Klangio ---
    file_hash = hashlib.sha256(data).hexdigest()
    cached = db.find_by_hash(file_hash)
    if cached:
        return jsonify(
            songId=cached["id"],
            songName=cached["song_name"],
            notes=json.loads(cached["notes_json"]),
            bestStreak=cached["best_streak"],
            cached=True,
        )

    api_key = current_app.config.get("KLANGIO_API_KEY", "")
    model = current_app.config.get("KLANGIO_MODEL", "piano")

    if not api_key:
        # אין מפתח - מחזירים הסבר ידידותי (לא שגיאה טכנית) ומפנים לשיר הדוגמה.
        return (
            jsonify(error="no_api_key", message=klangio.friendly_message("NO_API_KEY")),
            503,
        )

    # --- ניתוח דרך Klangio ---
    try:
        midi_bytes = klangio.transcribe(data, filename, api_key, model)
        raw_notes = klangio.midi_to_notes(midi_bytes)
    except klangio.KlangioError as e:
        current_app.logger.warning("Klangio error: %s", e)
        status = 502
        if e.code in ("NO_API_KEY", "BAD_KEY"):
            status = 503
        return jsonify(error="klangio", code=e.code,
                       message=klangio.friendly_message(e.code)), status

    enriched = notes_mod.enrich(raw_notes)
    if not enriched:
        return (
            jsonify(error="no_notes", message=klangio.friendly_message("JOB_FAILED")),
            422,
        )

    row = db.insert_song(file_hash, song_name, json.dumps(enriched, ensure_ascii=False))
    return jsonify(
        songId=row["id"], songName=song_name, notes=enriched,
        bestStreak=0, cached=False,
    )


@bp.route("/songs", methods=["GET"])
def list_songs():
    out = []
    for s in db.list_songs():
        try:
            note_count = len(json.loads(s["notes_json"]))
        except (ValueError, TypeError):
            note_count = 0
        out.append(
            {
                "id": s["id"],
                "songName": s["song_name"],
                "createdAt": s["created_at"],
                "bestStreak": s["best_streak"],
                "noteCount": note_count,
            }
        )
    return jsonify(songs=out)


@bp.route("/songs/<int:song_id>", methods=["GET"])
def get_song(song_id):
    s = db.get_song(song_id)
    if not s:
        return jsonify(error="not_found", message="השיר לא נמצא. 🔍"), 404
    return jsonify(
        songId=s["id"],
        songName=s["song_name"],
        notes=json.loads(s["notes_json"]),
        bestStreak=s["best_streak"],
        cached=True,
    )


@bp.route("/songs/<int:song_id>", methods=["DELETE"])
def delete_song(song_id):
    db.delete_song(song_id)
    return jsonify(ok=True)


@bp.route("/songs/<int:song_id>/streak", methods=["POST"])
def save_streak(song_id):
    body = request.get_json(silent=True) or {}
    try:
        streak = int(body.get("streak", 0))
    except (ValueError, TypeError):
        streak = 0
    best = db.update_best_streak(song_id, streak)
    return jsonify(ok=True, bestStreak=best)


@bp.route("/demo", methods=["GET"])
def demo():
    return jsonify(
        songName="כוכב קטן 🌟 (שיר דוגמה)",
        notes=demo_data.demo_notes(),
        demo=True,
    )
