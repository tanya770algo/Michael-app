"""
מיכאל המלך - תווים 🎹👑
נקודת הכניסה הראשית לשרת Flask.

הרצה:
    pip install -r requirements.txt
    cp .env.example .env   # ואז ערכו את .env והכניסו מפתח Klangio
    python app.py
ואז פותחים בדפדפן: http://localhost:5000
"""
import os
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv

# טוען משתני סביבה מקובץ .env (אם קיים)
load_dotenv()


def create_app():
    app = Flask(__name__)

    # תקרת גודל קובץ העלאה (100MB) - יותר מספיק לכל שיר, גם באיכות WAV גבוהה.
    # שימו לב: המגבלה האמיתית היא *אורך* האודיו ב-Klangio (עד ~5 דקות בחבילות בתשלום),
    # לא גודל הקובץ ולא חבילת השרת.
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

    # מפתח ה-API וה-model נטענים מסביבה בלבד - אף פעם לא כתובים בקוד.
    app.config["KLANGIO_API_KEY"] = os.environ.get("KLANGIO_API_KEY", "").strip()
    app.config["KLANGIO_MODEL"] = os.environ.get("KLANGIO_MODEL", "piano").strip()

    # יצירת טבלת הדאטהבייס אם עוד לא קיימת
    from michael_king.db import init_db
    init_db()

    # רישום ה-blueprint של הפיצ'ר תחת /api/michael-king/
    from michael_king.routes import bp as michael_king_bp
    app.register_blueprint(michael_king_bp)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.errorhandler(413)
    def too_large(_e):
        return (
            jsonify(
                error="too_large",
                message="הקובץ גדול מדי 😅 נסו קובץ קצר יותר (עד 100MB, ועד ~5 דקות).",
            ),
            413,
        )

    return app


app = create_app()


if __name__ == "__main__":
    # ב-macOS פורט 5000 תפוס לרוב ע"י "AirPlay Receiver", לכן ברירת המחדל היא 5050.
    # אפשר לשנות עם משתנה הסביבה PORT, למשל:  PORT=8000 python app.py
    port = int(os.environ.get("PORT", "5050"))
    # debug=True נוח לפיתוח; בסביבת production כדאי לכבות.
    app.run(host="0.0.0.0", port=port, debug=True)
