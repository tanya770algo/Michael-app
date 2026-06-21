# 🚀 איך להעלות את "מיכאל המלך" לאוויר (חינם) ב-Render

המטרה: שיהיה לאפליקציה כתובת אינטרנט קבועה (למשל `https://michael-king.onrender.com`)
שתעבוד מכל מכשיר, גם כשהמחשב שלך כבוי.

יש שני שלבים: **(א)** להעלות את הקוד ל-GitHub, **(ב)** לחבר את GitHub ל-Render.
כבר הכנתי הכול (הקוד, ה-commit הראשון, וקובצי ההגדרות `render.yaml` + `Procfile`).

---

## שלב א' — להעלות את הקוד ל-GitHub

צריך חשבון GitHub (חינם) — נרשמים ב-https://github.com/signup אם אין.

### הדרך הקלה: GitHub Desktop (בלי טרמינל) ⭐
1. מורידים ומתקינים את **GitHub Desktop**: https://desktop.github.com
2. נכנסים עם חשבון GitHub.
3. בתפריט: **File → Add Local Repository** ובוחרים את התיקייה `Michael app`
   (כבר יש בה repo עם commit מוכן, אז זה יזוהה מיד).
4. לוחצים **Publish repository** (אפשר להשאיר אותו Private או לעשות Public — שניהם בסדר).

זהו — הקוד עכשיו ב-GitHub. ✅

### הדרך החלופית: דרך הטרמינל
מתוך תיקיית הפרויקט (אם נסגר הטרמינל: `cd ~/Desktop/"Michael app"`):
```bash
git remote add origin https://github.com/USERNAME/michael-king.git
git branch -M main
git push -u origin main
```
(מחליפים `USERNAME` בשם המשתמש שלך, ויוצרים קודם ב-GitHub repo ריק בשם `michael-king`,
בלי לסמן "Add a README"). אם מבקש סיסמה — GitHub דורש **Personal Access Token**
במקום סיסמה, ולכן GitHub Desktop פשוט יותר.

---

## שלב ב' — לפרוס ב-Render

1. נכנסים ל-https://dashboard.render.com ונרשמים — **הכי נוח להירשם עם GitHub**
   ("Sign in with GitHub"), ככה Render כבר מחובר לקוד שלך.
2. לוחצים **New +** → **Web Service**.
3. בוחרים את הריפו `michael-king` שהעלית (אם צריך, מאשרים ל-Render גישה לריפו).
4. ממלאים את ההגדרות:

   | הגדרה | ערך |
   |-------|-----|
   | **Language** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `gunicorn app:app --bind 0.0.0.0:$PORT` |
   | **Instance Type** | **Free** |

5. גוללים ל-**Environment Variables** ומוסיפים (אופציונלי, רק אם יש לך מפתח Klangio):
   - `KLANGIO_API_KEY` = המפתח שלך
   - `KLANGIO_MODEL` = `piano`
6. לוחצים **Create Web Service** וממתינים 1-3 דקות עד שה-build מסתיים.

כשמופיע **"Live"** — האפליקציה באוויר בכתובת `https://<השם-שבחרת>.onrender.com` 🎉
(אפשר ללחוץ "נגנו שיר דוגמה" כדי לראות שהכול עובד.)

> 💡 אם תרצי, אפשר במקום שלבים 2-6 ללחוץ **New + → Blueprint** ולבחור את הריפו —
> Render יקרא את `render.yaml` ויגדיר את הכול אוטומטית (יישאר רק למלא את ה-KLANGIO_API_KEY).

---

## דברים שחשוב לדעת על החבילה החינמית

- 😴 **"שינה" אחרי 15 דקות חוסר פעילות**: הכניסה הראשונה אחרי הפסקה לוקחת ~60 שניות
  (השרת "מתעורר"). אחר כך זה מהיר. זה נורמלי בחבילה החינמית.
- 💾 **השירים השמורים עלולים להתאפס**: בחבילה החינמית האחסון זמני (ephemeral), כך
  ש"השירים שלי" יכולים להתאפס בעדכון/הפעלה מחדש של השרת. שיר הדוגמה והניתוח תמיד עובדים.
  (לשמירה קבועה צריך דיסק/דאטהבייס בתשלום — אפשר להוסיף בהמשך אם רוצים.)
- 🔑 **המפתח של Klangio** נשמר בתור Environment Variable ב-Render בלבד — לא בקוד ולא ב-GitHub.
- 🔁 **עדכונים**: כל `git push` חדש (או Publish ב-GitHub Desktop) יעדכן את האתר אוטומטית.

בהצלחה! 👑🎶
