import { Link } from 'react-router';
import { Card } from '../components/ui';
import { isStandalone } from '../push/usePush';

const STEPS = [
  { emoji: '1️⃣', text: 'פותחים את האתר ב־Safari (לא בכרום ולא מתוך וואטסאפ)' },
  { emoji: '2️⃣', text: 'לוחצים על כפתור השיתוף — הריבוע עם החץ למעלה ⬆️ בתחתית המסך' },
  { emoji: '3️⃣', text: 'גוללים ובוחרים "הוסף למסך הבית" (Add to Home Screen)' },
  { emoji: '4️⃣', text: 'לוחצים "הוסף" — ואייקון ⚽ יופיע על מסך הבית' },
  { emoji: '5️⃣', text: 'מעכשיו נכנסים רק דרך האייקון — ובפרופיל מפעילים התראות 🔔' },
];

export default function Install() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <div className="text-center">
        <div className="text-6xl">📲</div>
        <h1 className="font-display mt-3 text-2xl font-extrabold text-grass-300">
          התקנה על האייפון
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          ככה "0 מושג בכדורגל" הופך לאפליקציה אמיתית עם התראות
        </p>
      </div>

      {isStandalone() ? (
        <Card className="text-center">
          <div className="text-3xl">🎉</div>
          <p className="mt-2 font-bold text-grass-300">האפליקציה כבר מותקנת!</p>
          <p className="mt-1 text-sm text-ink-dim">אפשר להפעיל התראות במסך הפרופיל.</p>
        </Card>
      ) : (
        <Card>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step) => (
              <li key={step.emoji} className="flex items-start gap-3">
                <span className="text-xl">{step.emoji}</span>
                <span className="pt-0.5 text-sm leading-relaxed">{step.text}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <p className="text-center text-xs text-ink-dim">
        דורש iPhone עם iOS 16.4 ומעלה כדי לקבל התראות.
      </p>
      <Link to="/" className="text-center text-sm font-bold text-grass-300 underline">
        חזרה לאפליקציה
      </Link>
    </div>
  );
}
