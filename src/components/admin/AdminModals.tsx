import React, { memo, useEffect, useState } from 'react';
import type {
  AggregatedEditSuggestion,
  CardItem,
  CardKind,
  GroupSubmission,
  Language,
  QuoteSubdeck,
  RuhiChapter,
  StackId,
  StackMeta,
} from '../../types/deck';

interface CardFormFieldsProps {
  draft: CardItem;
  stacks: StackMeta[];
  isDe: boolean;
  allowEmptyStack?: boolean;
  requireDe?: boolean;
  requireEn?: boolean;
  deLabel?: React.ReactNode;
  enLabel?: React.ReactNode;
  onChange: (next: CardItem) => void;
}

const CardFormFields: React.FC<CardFormFieldsProps> = ({
  draft,
  stacks,
  isDe,
  allowEmptyStack = false,
  requireDe = true,
  requireEn = true,
  deLabel,
  enLabel,
  onChange,
}) => (
  <>
    <div className="grid grid-cols-2 gap-2">
      <select
        value={draft.stackId}
        onChange={(e) => {
          const sid = e.target.value;
          onChange({
            ...draft,
            stackId: sid,
            kind:
              draft.kind === 'wildcard'
                ? 'wildcard'
                : sid === 'quotes'
                  ? 'quote'
                  : 'question',
          });
        }}
        className="rounded-lg px-3 py-2 text-xs"
        style={{
          backgroundColor: 'var(--subtle)',
          color: draft.stackId ? 'var(--ink)' : 'var(--ink-muted)',
          border: '1px solid var(--border)',
        }}
      >
        {allowEmptyStack && (
          <option value="">{isDe ? 'Kategorie wählen…' : 'Choose category…'}</option>
        )}
        {stacks.map((s) => (
          <option key={s.id} value={s.id}>
            {isDe ? s.nameDe : s.nameEn}
          </option>
        ))}
      </select>

      <select
        value={draft.kind}
        onChange={(e) => onChange({ ...draft, kind: e.target.value as CardKind })}
        className="rounded-lg px-3 py-2 text-xs"
        style={{
          backgroundColor: 'var(--subtle)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
        }}
      >
        <option value="question">{isDe ? 'Frage' : 'Question'}</option>
        <option value="quote">{isDe ? 'Zitat' : 'Quote'}</option>
        <option value="wildcard">{isDe ? 'Impuls / Wildcard' : 'Wildcard / Moment'}</option>
      </select>
    </div>

    {draft.kind === 'quote' && (
      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.quoteSubdeck || 'general'}
          onChange={(e) =>
            onChange({
              ...draft,
              quoteSubdeck: e.target.value as QuoteSubdeck,
            })
          }
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        >
          <option value="general">General</option>
          <option value="ruhi">Ruhi Book 1</option>
        </select>

        {draft.quoteSubdeck === 'ruhi' && (
          <select
            value={draft.ruhiChapter || 1}
            onChange={(e) =>
              onChange({
                ...draft,
                ruhiChapter: Number(e.target.value) as RuhiChapter,
              })
            }
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--subtle)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
            }}
          >
            <option value={1}>Chapter 1</option>
            <option value={2}>Chapter 2</option>
            <option value={3}>Chapter 3</option>
          </select>
        )}
      </div>
    )}

    <div className="space-y-1">
      {deLabel}
      <textarea
        required={requireDe}
        rows={3}
        value={draft.de}
        onChange={(e) => onChange({ ...draft, de: e.target.value })}
        placeholder="Deutsch (DE)"
        className="w-full rounded-xl p-3 text-sm"
        style={{
          backgroundColor: 'var(--subtle)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
        }}
      />
    </div>
    <div className="space-y-1">
      {enLabel}
      <textarea
        required={requireEn}
        rows={3}
        value={draft.en}
        onChange={(e) => onChange({ ...draft, en: e.target.value })}
        placeholder="English (EN)"
        className="w-full rounded-xl p-3 text-sm"
        style={{
          backgroundColor: 'var(--subtle)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
        }}
      />
    </div>

    {draft.kind === 'quote' ? (
      <>
        <input
          type="text"
          value={draft.author || ''}
          onChange={(e) => onChange({ ...draft, author: e.target.value })}
          placeholder="Author"
          className="w-full rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="url"
            value={draft.sourceUrlDe || ''}
            onChange={(e) => onChange({ ...draft, sourceUrlDe: e.target.value })}
            placeholder="Source URL (DE)"
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--subtle)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
            }}
          />
          <input
            type="url"
            value={draft.sourceUrlEn || ''}
            onChange={(e) => onChange({ ...draft, sourceUrlEn: e.target.value })}
            placeholder="Source URL (EN)"
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--subtle)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <input
          type="text"
          value={draft.promptDe || ''}
          onChange={(e) => onChange({ ...draft, promptDe: e.target.value })}
          placeholder="Gesprächsimpuls (DE)"
          className="w-full rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
        <input
          type="text"
          value={draft.promptEn || ''}
          onChange={(e) => onChange({ ...draft, promptEn: e.target.value })}
          placeholder="Conversation question (EN)"
          className="w-full rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
      </>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          value={draft.digDeeperDe || ''}
          onChange={(e) => onChange({ ...draft, digDeeperDe: e.target.value })}
          placeholder={isDe ? 'Optional: Nachfrage (DE)' : 'Optional: Follow-up (DE)'}
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
        <input
          type="text"
          value={draft.digDeeperEn || ''}
          onChange={(e) => onChange({ ...draft, digDeeperEn: e.target.value })}
          placeholder={isDe ? 'Optional: Nachfrage (EN)' : 'Optional: Follow-up (EN)'}
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--subtle)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
      </div>
    )}
  </>
);

interface FriendEditsCalloutProps {
  pendingEdits?: AggregatedEditSuggestion[];
  isDe: boolean;
  onUseWording: (language: Language, text: string, editId: string) => void;
}

const FriendEditsCallout: React.FC<FriendEditsCalloutProps> = ({
  pendingEdits,
  isDe,
  onUseWording,
}) => {
  if (!pendingEdits || pendingEdits.length === 0) return null;
  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{
        backgroundColor: 'var(--subtle)',
        borderColor: 'var(--gold-hairline)',
      }}
    >
      <div className="text-[11px] font-medium" style={{ color: 'var(--gold)' }}>
        {isDe ? 'Textvorschläge von Freunden' : 'Friend wording suggestions'}
      </div>
      <div className="space-y-2">
        {pendingEdits.map((ed) => (
          <div
            key={ed.id}
            className="flex items-start justify-between gap-2 text-xs pt-1.5 border-t first:border-t-0 first:pt-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="min-w-0 space-y-0.5">
              <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {ed.language.toUpperCase()} · {ed.reviewerName || 'Friend'}
              </div>
              <div style={{ color: 'var(--ink)' }}>{ed.suggestedText}</div>
            </div>
            <button
              type="button"
              onClick={() => onUseWording(ed.language, ed.suggestedText, ed.id)}
              className="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:bg-[var(--elevated)]"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--ink)',
              }}
            >
              {isDe ? 'Übernehmen' : 'Use wording'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CardEditorModalProps {
  card: CardItem;
  pendingEdits?: AggregatedEditSuggestion[];
  initialDismissEditId?: string;
  stacks: StackMeta[];
  isDe: boolean;
  busy: boolean;
  onSave: (card: CardItem, dismissEditId?: string) => void;
  onClose: () => void;
}

export const CardEditorModal: React.FC<CardEditorModalProps> = memo(
  ({ card, pendingEdits, initialDismissEditId, stacks, isDe, busy, onSave, onClose }) => {
    const [draft, setDraft] = useState<CardItem>(card);
    const [dismissEditId, setDismissEditId] = useState<string | undefined>(initialDismissEditId);

    useEffect(() => {
      setDraft(card);
      setDismissEditId(initialDismissEditId);
    }, [card, initialDismissEditId]);

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--scrim)' }}
        onClick={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onSave(draft, dismissEditId);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-strong)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Karte bearbeiten' : 'Edit Card'}
            </h2>
            <span
              className="text-[11px] font-mono px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-soft)' }}
            >
              {draft.id}
            </span>
          </div>

          <FriendEditsCallout
            pendingEdits={pendingEdits}
            isDe={isDe}
            onUseWording={(language, text, editId) => {
              setDraft((prev) => ({ ...prev, [language]: text }));
              setDismissEditId(editId);
            }}
          />

          <CardFormFields draft={draft} stacks={stacks} isDe={isDe} onChange={setDraft} />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? 'Speichern' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    );
  },
);
CardEditorModal.displayName = 'CardEditorModal';

interface SuggestionEditorModalProps {
  card: CardItem;
  pendingEdits: AggregatedEditSuggestion[];
  initialDismissEditId?: string;
  stacks: StackMeta[];
  isDe: boolean;
  busy: boolean;
  onSaveDraft: (card: CardItem) => void;
  onPublish: (card: CardItem, dismissEditId?: string) => void;
  onClose: () => void;
}

export const SuggestionEditorModal: React.FC<SuggestionEditorModalProps> = memo(
  ({
    card,
    pendingEdits,
    initialDismissEditId,
    stacks,
    isDe,
    busy,
    onSaveDraft,
    onPublish,
    onClose,
  }) => {
    const [draft, setDraft] = useState<CardItem>(card);
    const [dismissEditId, setDismissEditId] = useState<string | undefined>(initialDismissEditId);

    useEffect(() => {
      setDraft(card);
      setDismissEditId(initialDismissEditId);
    }, [card, initialDismissEditId]);

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--scrim)' }}
        onClick={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onSaveDraft(draft);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-strong)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-serif-card text-xl font-medium m-0">
                {isDe ? 'Vorschlag bearbeiten' : 'Edit Suggestion'}
              </h2>
              <span
                className="text-[11px] font-mono px-2 py-0.5 rounded"
                style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-soft)' }}
              >
                {draft.id}
              </span>
            </div>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium"
              style={{ backgroundColor: 'var(--gold-soft)', color: 'var(--gold)' }}
            >
              {isDe ? 'Entwurf · Noch nicht live' : 'Draft · Not live yet'}
            </span>
          </div>

          <FriendEditsCallout
            pendingEdits={pendingEdits}
            isDe={isDe}
            onUseWording={(language, text, editId) => {
              setDraft((prev) => ({ ...prev, [language]: text }));
              setDismissEditId(editId);
            }}
          />

          <CardFormFields draft={draft} stacks={stacks} isDe={isDe} onChange={setDraft} />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-60 hover:bg-[var(--elevated)]"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
              }}
            >
              {isDe ? 'Entwurf speichern' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!busy) onPublish(draft, dismissEditId);
              }}
              className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? 'Speichern & Live schalten' : 'Save & Put Live'}
            </button>
          </div>
        </form>
      </div>
    );
  },
);
SuggestionEditorModal.displayName = 'SuggestionEditorModal';

interface InboxSubmissionModalProps {
  submission: GroupSubmission;
  stacks: StackMeta[];
  isDe: boolean;
  busy: boolean;
  onSaveDraft: (input: {
    id: string;
    text: string;
    language: Language;
    authorName?: string;
    promotedStackId?: StackId;
  }) => void;
  onPromote: (submissionId: string, card: CardItem) => void;
  onClose: () => void;
}

function buildCardFromSubmission(submission: GroupSubmission): CardItem {
  const targetStack = submission.promotedStackId || '';
  return {
    id: `C_${Date.now()}`,
    stackId: targetStack,
    kind: targetStack === 'quotes' ? 'quote' : 'question',
    de: submission.language === 'de' ? submission.text : '',
    en: submission.language === 'en' ? submission.text : '',
    isCustom: true,
    contributedBy: submission.authorName,
    createdAt: new Date().toISOString(),
  };
}

export const InboxSubmissionModal: React.FC<InboxSubmissionModalProps> = memo(
  ({ submission, stacks, isDe, busy, onSaveDraft, onPromote, onClose }) => {
    const [draft, setDraft] = useState<CardItem>(() => buildCardFromSubmission(submission));
    const [authorName, setAuthorName] = useState<string>(submission.authorName || '');

    useEffect(() => {
      setDraft(buildCardFromSubmission(submission));
      setAuthorName(submission.authorName || '');
    }, [submission]);

    const hasCategory = Boolean(draft.stackId && stacks.some((s) => s.id === draft.stackId));
    const hasDe = draft.de.trim().length > 0;
    const hasEn = draft.en.trim().length > 0;
    const canPublish = hasCategory && hasDe && hasEn;

    const missingChecklist: string[] = [];
    if (!hasCategory) {
      missingChecklist.push(isDe ? 'Kategorie wählen' : 'Select a category');
    }
    if (!hasDe) {
      missingChecklist.push(isDe ? 'Deutsche Übersetzung (DE)' : 'German translation (DE)');
    }
    if (!hasEn) {
      missingChecklist.push(isDe ? 'Englische Übersetzung (EN)' : 'English translation (EN)');
    }

    const renderLangLabel = (lang: Language, filled: boolean) => {
      const isOriginal = submission.language === lang;
      return (
        <div className="flex items-center justify-between text-[11px] px-0.5">
          <span style={{ color: 'var(--ink-muted)' }}>
            {lang === 'de' ? 'Deutsch (DE)' : 'English (EN)'} ·{' '}
            {isOriginal ? 'Original' : isDe ? 'Übersetzung' : 'Translation'}
          </span>
          {!isOriginal && (
            <span
              className="px-2 py-0.5 rounded-full font-medium"
              style={
                filled
                  ? { backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }
                  : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
              }
            >
              {filled
                ? isDe
                  ? 'Übersetzt'
                  : 'Translated'
                : isDe
                  ? 'Übersetzung erforderlich'
                  : 'Translation required'}
            </span>
          )}
        </div>
      );
    };

    const handleSaveSubmissionDraft = (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      const textInLang =
        (submission.language === 'de' ? draft.de : draft.en).trim() ||
        draft.de.trim() ||
        draft.en.trim();
      onSaveDraft({
        id: submission.id,
        text: textInLang,
        language: submission.language,
        authorName,
        promotedStackId: draft.stackId || '',
      });
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--scrim)' }}
        onClick={onClose}
      >
        <form
          onSubmit={handleSaveSubmissionDraft}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-strong)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Einreichung bearbeiten' : 'Edit Submission'}
            </h2>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium font-mono"
              style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
            >
              Room {submission.roomCode} · {submission.language.toUpperCase()}
            </span>
          </div>

          <input
            type="text"
            maxLength={60}
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder={isDe ? 'Autor / Gastname (optional)' : 'Author / Guest name (optional)'}
            className="w-full rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--subtle)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
            }}
          />

          <CardFormFields
            draft={draft}
            stacks={stacks}
            isDe={isDe}
            allowEmptyStack
            requireDe={submission.language === 'de'}
            requireEn={submission.language === 'en'}
            deLabel={renderLangLabel('de', hasDe)}
            enLabel={renderLangLabel('en', hasEn)}
            onChange={setDraft}
          />

          {!canPublish && (
            <div
              className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--subtle)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-muted)',
              }}
            >
              <span className="font-medium" style={{ color: 'var(--ink)' }}>
                {isDe ? 'Vor dem Live-Schalten erforderlich: ' : 'Required before putting live: '}
              </span>
              {missingChecklist.join(' · ')}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-60 hover:bg-[var(--elevated)]"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
              }}
            >
              {isDe ? 'Entwurf speichern' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={busy || !canPublish}
              title={!canPublish ? missingChecklist.join(' · ') : undefined}
              onClick={() => {
                if (!busy && canPublish) {
                  onPromote(submission.id, {
                    ...draft,
                    de: draft.de.trim(),
                    en: draft.en.trim(),
                    contributedBy: authorName.trim() || undefined,
                  });
                }
              }}
              className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? 'Speichern & Live schalten' : 'Save & Put Live'}
            </button>
          </div>
        </form>
      </div>
    );
  },
);
InboxSubmissionModal.displayName = 'InboxSubmissionModal';
