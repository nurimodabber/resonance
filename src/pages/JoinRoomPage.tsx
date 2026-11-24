import React, { useMemo, useState } from 'react';
import { CheckIcon, ChevronLeftIcon } from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { STACKS, STACK_MAP } from '../data/stacks';
import { submitGroupQuestion } from '../services/repository';
import type { StackId } from '../types/deck';

interface JoinRoomPageProps {
  roomCode: string;
}

export const JoinRoomPage: React.FC<JoinRoomPageProps> = ({ roomCode }) => {
  const { lang, cards, navigate } = useResonance();
  const [tab, setTab] = useState<'write' | 'browse'>('write');
  const [questionText, setQuestionText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [addedCardIds, setAddedCardIds] = useState<string[]>([]);
  const [filterStack, setFilterStack] = useState<StackId | 'all'>('all');
  const [search, setSearch] = useState('');

  const isDe = lang === 'de';
  const normalizedCode = roomCode.toUpperCase();

  const browseableCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (c.archived || c.kind === 'wildcard') return false;
      if (filterStack !== 'all' && c.stackId !== filterStack) return false;
      if (q) {
        return (
          c.de.toLowerCase().includes(q) ||
          c.en.toLowerCase().includes(q) ||
          (c.author?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [cards, filterStack, search]);

  const handleWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitGroupQuestion({
        roomCode: normalizedCode,
        text: questionText,
        language: lang,
        authorName: authorName.trim() || undefined,
      });
      setQuestionText('');
      setSentCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickExisting = async (cardId: string, text: string) => {
    if (addedCardIds.includes(cardId)) return;
    setAddedCardIds((prev) => [...prev, cardId]);
    await submitGroupQuestion({
      roomCode: normalizedCode,
      text,
      language: lang,
      sourceCardId: cardId,
    });
    setSentCount((c) => c + 1);
  };

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          <ChevronLeftIcon size={14} />
          <span>{isDe ? 'Zur App' : 'Back to app'}</span>
        </button>

        <span
          className="px-3 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {isDe ? `Runde ${normalizedCode}` : `Room ${normalizedCode}`}
        </span>
      </div>

      {/* Double-Bezel Header & Mode Switch */}
      <div className="sculpted-bezel p-1.5 rounded-[28px]">
        <div className="cardstock rounded-[22px] p-5 sm:p-6 space-y-4">
          <div>
            <h1 className="font-serif-card text-2xl font-medium m-0">
              {isDe ? 'Frage in die Runde geben' : 'Drop a question into the pile'}
            </h1>
            <p className="text-xs sm:text-sm m-0 mt-1" style={{ color: 'var(--ink-muted)' }}>
              {isDe
                ? 'Standardmäßig anonym – deine Frage mischt sich automatisch in den aktuellen Stapel.'
                : 'Anonymous by default—anything you add shuffles straight into tonight’s deck.'}
            </p>
          </div>

          {/* Tabs */}
          <div
            className="grid grid-cols-2 p-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setTab('write')}
              className="py-2 rounded-full transition-colors cursor-pointer"
              style={{
                backgroundColor: tab === 'write' ? 'var(--accent)' : 'transparent',
                color: tab === 'write' ? 'var(--accent-ink)' : 'var(--ink-muted)',
              }}
            >
              {isDe ? 'Eigene Frage' : 'Write your own'}
            </button>
            <button
              type="button"
              onClick={() => setTab('browse')}
              className="py-2 rounded-full transition-colors cursor-pointer"
              style={{
                backgroundColor: tab === 'browse' ? 'var(--accent)' : 'transparent',
                color: tab === 'browse' ? 'var(--accent-ink)' : 'var(--ink-muted)',
              }}
            >
              {isDe ? 'Aus Stapeln wählen' : 'Pick from decks'}
            </button>
          </div>

          {sentCount > 0 && (
            <div
              className="rounded-2xl px-4 py-2.5 text-xs flex items-center justify-between"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <span>
                {sentCount === 1
                  ? isDe
                    ? '1 Frage in den Stapel gemischt.'
                    : '1 question mixed into the pile.'
                  : isDe
                    ? `${sentCount} Fragen in den Stapel gemischt.`
                    : `${sentCount} questions mixed into the pile.`}
              </span>
              <CheckIcon size={14} />
            </div>
          )}

          {tab === 'write' ? (
            <form onSubmit={handleWriteSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="qr-question-input"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {isDe ? 'Deine Frage oder dein Gedanke' : 'Your question or prompt'}
                </label>
                <textarea
                  id="qr-question-input"
                  rows={4}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder={
                    isDe
                      ? 'Worüber würdest du heute Abend gerne ehrlich sprechen?'
                      : 'What would you genuinely love to talk about tonight?'
                  }
                  className="w-full rounded-2xl p-3.5 text-sm resize-none"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border-strong)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="qr-author-input"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {isDe ? 'Name (optional – leer lassen für anonym)' : 'Name (optional — leave blank for anonymous)'}
                </label>
                <input
                  id="qr-author-input"
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder={isDe ? 'Anonym' : 'Anonymous'}
                  className="w-full rounded-full px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !questionText.trim()}
                className="w-full py-3 rounded-full text-sm font-medium transition-opacity disabled:opacity-45 cursor-pointer"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {submitting
                  ? isDe
                    ? 'Wird eingeworfen…'
                    : 'Adding to pile…'
                  : isDe
                    ? 'In den Stapel werfen'
                    : 'Add to tonight’s pile'}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isDe ? 'Fragen durchsuchen…' : 'Search questions…'}
                  className="flex-1 rounded-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <select
                  value={filterStack}
                  onChange={(e) => setFilterStack(e.target.value as StackId | 'all')}
                  aria-label="Filter by stack"
                  className="rounded-full px-3.5 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <option value="all">{isDe ? 'Alle Stapel' : 'All stacks'}</option>
                  {STACKS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {isDe ? s.nameDe : s.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {browseableCards.slice(0, 45).map((card) => {
                  const stack = STACK_MAP[card.stackId];
                  const added = addedCardIds.includes(card.id);
                  const text = isDe ? card.de : card.en;

                  return (
                    <div
                      key={card.id}
                      className="rounded-2xl p-3.5 flex items-center justify-between gap-3"
                      style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stack.accent }}
                          />
                          <span>{isDe ? stack.nameDe : stack.nameEn}</span>
                        </div>
                        <p className="text-xs sm:text-sm leading-snug m-0" style={{ color: 'var(--ink)' }}>
                          {text}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePickExisting(card.id, text)}
                        disabled={added}
                        className="px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: added ? 'var(--accent-soft)' : 'var(--elevated)',
                          color: added ? 'var(--accent)' : 'var(--ink)',
                        }}
                      >
                        {added ? (isDe ? 'Drin' : 'Added') : isDe ? 'Wählen' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
