// Venmo payment-note quotes. Hebrew (RTL), so they look scrambled in an
// editor; that is expected. Kept exactly as written: do not translate, edit,
// reorder, or fix punctuation.

export const VENMO_QUOTES: readonly string[] = [
  'אני אומר לך היה לי פול קינג בפלופ. אתה מדבר איתי על קוף?!',
  'את הילד שלי אני שם על דבר כזה',
  'נפתח בטרן 8, בריבר עוד 8 פטרוזיליה...',
  'נפתח הפלופ קינג 8 8, אני יושב עם זוג קינג, הוא עם אס 2 – אוף סוט! אין לו כלום!',
  'אתה לא צריך לזיין אותי אחי, מה שאתה אוכל תיתן לו קצת',
  'את אולי משתעלת כמו בן – אבל את לא בן! את לא בן נקודה',
  'יום נאחס, יום לא נפתח כלום!',
  'זה וירוס שאם הוא תוקף אותך הוא נכנס לך ככה: קקקככככככככככ',
  'זאת מחלה ממהרת ואנחנו חייבים להיות יותר זריזים ממנה',
  'יום נאחס היה לי מוות',
  'לכי ליגאל! לכי לאונר"א מצידי!',
  'זה לא הסבתות מהאגודה למען החייל, זה חברה רציניים',
  'זה? זה שק',
  'חשמל סטטי.',
  'שני קנגרו',
  'תחתום לי כבר על הפינוי הזה יגאל',
  'תן לי עוד 100 פעם את אותו יד אני עושה את אותו דבר',
  'שונא זוג קינג זה הקלף שאני הכי שונא',
  'איזה חולה ואיזה נעליים הפסדתי אותו בפוקר',
  'הפסדת קוף בפוקר?',
  'התסברות של אחד נקודה פסיק שתיים אחוז שדבר כזה יקרה',
  'איזה משחק זה תשמע... אתה נגרר ונגרר',
]

let lastIndex = -1

/**
 * A random quote, never the same one twice in a row within this session.
 * Call it once per render of a button (see VenmoButton), never inside an
 * href expression: the note must not change between seeing the button and
 * tapping it.
 */
export function pickQuote(
  quotes: readonly string[] = VENMO_QUOTES,
  random: () => number = Math.random,
): string {
  if (quotes.length === 0) return ''
  let i = Math.floor(random() * quotes.length)
  if (quotes.length > 1 && i === lastIndex) i = (i + 1) % quotes.length
  lastIndex = i
  return quotes[i]
}
