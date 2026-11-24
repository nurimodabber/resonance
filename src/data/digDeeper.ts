import type { StackId } from '../types/deck';

export interface FollowUpPrompt {
  de: string;
  en: string;
}

export const DIG_DEEPER_PROMPTS: Record<string, FollowUpPrompt[]> = {
  warmup: [
    {
      de: 'Was genau macht diesen Moment oder dieses Detail für dich so lebendig?',
      en: 'What specifically makes that moment or detail feel so alive for you?',
    },
    {
      de: 'Mit wem würdest du das als Nächstes am liebsten teilen?',
      en: 'Who would you most love to share something like that with next?',
    },
    {
      de: 'Was verrät das über das, was dir im Kern wirklich Freude schenkt?',
      en: 'What does that reveal about what genuinely brings you joy?',
    },
    {
      de: 'Wann hast du dir dafür zuletzt bewusst Zeit genommen?',
      en: 'When did you last intentionally make space for that?',
    },
    {
      de: 'Welches kleine Stück davon könntest du schon diese Woche wieder in deinen Alltag holen?',
      en: 'What small piece of that could you bring back into your week?',
    },
  ],
  reflection: [
    {
      de: 'Was hat sich seit dieser Erkenntnis in deinem Alltag spürbar verändert?',
      en: 'What has noticeably shifted in your daily life since realizing that?',
    },
    {
      de: 'Welche Stärke in dir ist genau dadurch gewachsen?',
      en: 'What strength inside you grew directly out of that?',
    },
    {
      de: 'Was möchtest du von dieser Erfahrung unbedingt weitertragen?',
      en: 'What from this experience do you definitely want to carry forward?',
    },
    {
      de: 'Wer oder was hat dir damals geholfen, klarer zu sehen?',
      en: 'Who or what helped you see more clearly at that time?',
    },
    {
      de: 'Welcher nächste kleine Schritt würde sich heute ehrlich und stimmig anfühlen?',
      en: 'What next small step would feel honest and true to you right now?',
    },
  ],
  vulnerability: [
    {
      de: 'Was hat dich damals oder heute inmitten dessen getragen?',
      en: 'What held or sustained you in the middle of that?',
    },
    {
      de: 'Wenn ein enger Freund dir genau das anvertrauen würde – was würdest du ihm zusprechen?',
      en: 'If a close friend shared that exact thing with you, what would you say to them?',
    },
    {
      de: 'Welche sanfte Wahrheit oder Kraft steckt für dich hinter dieser Erfahrung?',
      en: 'What quiet truth or resilience sits underneath that experience for you?',
    },
    {
      de: 'Wie darf man dich an Tagen begleiten, an denen sich das besonders schwer anfühlt?',
      en: 'How can the people who love you show up for you on days when that feels heavy?',
    },
    {
      de: 'Woran merkst du, dass bereits ein Stück Heilung oder Frieden begonnen hat?',
      en: 'How can you tell that a quiet measure of healing or peace has already begun?',
    },
  ],
  friendship: [
    {
      de: 'Wann hast du das zwischen uns – oder mit einem lieben Menschen – besonders gespürt?',
      en: 'When have you felt that most vividly between us—or with someone you care about?',
    },
    {
      de: 'Was hilft dir, in solchen Momenten noch offener und mutiger zu bleiben?',
      en: 'What helps you stay open and brave in moments like that?',
    },
    {
      de: 'Was möchtest du mir oder deinen engsten Freunden künftig noch bewusster schenken?',
      en: 'What do you want to offer me or your closest friends more intentionally going forward?',
    },
    {
      de: 'Welche kleine Geste zwischen uns könnte das schon heute Abend lebendig machen?',
      en: 'What small gesture between us could bring that to life even tonight?',
    },
    {
      de: 'Was habt ihr gemeinsam gelernt, das eure Verbindung tiefer gemacht hat?',
      en: 'What have you learned together that made your bond deeper?',
    },
  ],
  spirituality: [
    {
      de: 'Wie zeigt sich dieser Gedanke ganz konkret in deinem Alltag – nicht nur im Kopf?',
      en: 'How does that insight show up concretely in your ordinary days—not just as an idea?',
    },
    {
      de: 'Wann hast du das letzte Mal gespürt, dass dich dieser Blickwinkel innerlich freier macht?',
      en: 'When did you last feel that this perspective set something free inside you?',
    },
    {
      de: 'Welche Haltung oder Gewohnheit hilft dir, auch im Trubel damit verbunden zu bleiben?',
      en: 'What habit or posture helps you stay anchored in that amid a busy week?',
    },
    {
      de: 'Welche Hoffnung für dich oder die Welt wächst für dich aus diesem Gedanken?',
      en: 'What hope—for yourself or the world—grows out of that thought for you?',
    },
    {
      de: 'Mit wem oder wofür möchtest du diese Kraft als Dienst im Kleinen teilen?',
      en: 'Where or with whom would you like to turn that feeling into a quiet act of service?',
    },
  ],
  quotes: [
    {
      de: 'Welches einzelne Wort aus diesem Zitat klingt in dir gerade am stärksten nach?',
      en: 'Which single word or phrase from this quote lingers with you most right now?',
    },
    {
      de: 'Wie würde sich die kommende Woche anfühlen, wenn du genau diesen Gedanken bewusst mitnimmst?',
      en: 'How might the coming week feel if you carried this one thought intentionally into it?',
    },
    {
      de: 'Wo hast du genau diese Wahrheit schon einmal in einem Menschen lebendig gesehen?',
      en: 'Where have you witnessed this exact truth lived out by someone you know?',
    },
  ],
};

export function pickDigDeeper(
  stackId: StackId,
  indexOffset: number,
): FollowUpPrompt {
  const list = DIG_DEEPER_PROMPTS[stackId] || DIG_DEEPER_PROMPTS.reflection;
  return list[Math.abs(indexOffset) % list.length];
}
