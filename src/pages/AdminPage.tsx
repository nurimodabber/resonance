import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCheck2,
  Inbox,
  Layers,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import {
  CardEditorModal,
  InboxSubmissionModal,
  SuggestionEditorModal,
} from '../components/admin/AdminModals';
import { ConcentricLogo, StackArtwork, ThumbDownIcon, ThumbUpIcon } from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { buildStackMap, getStackMetaSafe, STACK_ICON_IDS } from '../data/stacks';
import {
  applyReviewEditSuggestion,
  archiveCard,
  archiveStack,
  changeAdminPassword,
  deleteCard,
  deleteStack,
  dismissReviewEditSuggestion,
  editGroupSubmission,
  fetchAdminAuthStatus,
  fetchAdminInsights,
  fetchAdminReviewSummary,
  loginAdmin,
  logoutAdmin,
  promoteReviewSuggestions,
  reorderStacks,
  reseedMissingCards,
  saveReviewSuggestionDraft,
  SEED_CARDS,
  setupAdmin,
  summarizeRatings,
  updateSubmissionStatus,
  upsertCard,
  upsertStack,
  type AdminAuthStatus,
  type AdminReviewSummary,
} from '../services/repository';
import {
  computeRecommendedIdSet,
  reviewCategoryKey,
  sortReviewStats,
} from '../utils/reviewScoring';
import type {
  CardItem,
  CardKind,
  CardRating,
  GroupSubmission,
  Language,
  RecommendationPreset,
  StackIconId,
  StackId,
  StackMeta,
} from '../types/deck';

type AdminTab = 'cards' | 'stacks' | 'review' | 'inbox' | 'insights' | 'security';
type CardStatusFilter = 'active' | 'archived' | 'all';
type StackStatusFilter = 'active' | 'archived' | 'all';
type ReviewSubTab = 'suggestion' | 'live' | 'edits';
type InboxStatusTab = 'pending' | 'promoted' | 'dismissed';
type InsightsSubTab = 'best' | 'worst';

function slugifyStackId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

function getInitials(email: string | null | undefined): string {
  if (!email) return 'R';
  const local = email.split('@')[0] || 'R';
  return local.slice(0, 2).toUpperCase();
}

export const AdminPage: React.FC = () => {
  const {
    lang,
    toggleLang,
    theme,
    toggleTheme,
    stacks: publicStacks,
    cards: publicCards,
    refreshCatalog,
    navigate,
  } = useResonance();
  const isDe = lang === 'de';

  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [claimEmail, setClaimEmail] = useState('milan.modabber@gmail.com');
  const [loginEmail, setLoginEmail] = useState('milan.modabber@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Portal shell navigation state
  const [tab, setTab] = useState<AdminTab>('cards');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Data state
  const [adminStacks, setAdminStacks] = useState<StackMeta[]>(publicStacks);
  const [adminCards, setAdminCards] = useState<CardItem[]>(publicCards);
  const [ratings, setRatings] = useState<CardRating[]>([]);
  const [submissions, setSubmissions] = useState<GroupSubmission[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  // Cards (Catalog) filters & state
  const [search, setSearch] = useState('');
  const [stackFilter, setStackFilter] = useState<StackId | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<CardKind | 'all'>('all');
  const [cardStatusFilter, setCardStatusFilter] = useState<CardStatusFilter>('active');
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{
    card: CardItem;
    pendingEdits?: AdminReviewSummary['stats'][number]['edits'];
    dismissEditId?: string;
  } | null>(null);

  // Stacks filters & modals
  const [stackStatusFilter, setStackStatusFilter] = useState<StackStatusFilter>('all');
  const [editingStack, setEditingStack] = useState<{
    isNew: boolean;
    stack: StackMeta;
  } | null>(null);
  const [deletingStack, setDeletingStack] = useState<{
    stack: StackMeta;
    cardCount: number;
    reassignTo: StackId;
  } | null>(null);

  // Inbox filters & submission modal
  const [inboxStatusTab, setInboxStatusTab] = useState<InboxStatusTab>('pending');
  const [inboxSearch, setInboxSearch] = useState('');
  const [editingSubmission, setEditingSubmission] = useState<GroupSubmission | null>(null);

  // Insights sub-tab
  const [insightsSubTab, setInsightsSubTab] = useState<InsightsSubTab>('best');

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Friend Review tab state
  const [reviewSummary, setReviewSummary] = useState<AdminReviewSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewPreset, setReviewPreset] = useState<RecommendationPreset>('auto');
  const [reviewCategory, setReviewCategory] = useState<string>('all');
  const [reviewSubTab, setReviewSubTab] = useState<ReviewSubTab>('suggestion');
  const [reviewSearch, setReviewSearch] = useState('');
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  const [copiedReviewLink, setCopiedReviewLink] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<{
    card: CardItem;
    pendingEdits: AdminReviewSummary['stats'][number]['edits'];
    dismissEditId?: string;
  } | null>(null);

  // Pagination & deferred search for 60fps typing/rendering
  const [cardsVisibleCount, setCardsVisibleCount] = useState(50);
  const [reviewVisibleCount, setReviewVisibleCount] = useState(50);
  const deferredSearch = useDeferredValue(search);
  const deferredReviewSearch = useDeferredValue(reviewSearch);
  const deferredInboxSearch = useDeferredValue(inboxSearch);

  const stackMap = useMemo(() => buildStackMap(adminStacks), [adminStacks]);
  const ratingSummary = useMemo(() => summarizeRatings(ratings), [ratings]);
  const firstStackId = adminStacks[0]?.id ?? 'warmup';
  const quotesStackId = adminStacks.find((s) => s.id === 'quotes')?.id ?? firstStackId;

  const loadInsightsData = useCallback(async () => {
    try {
      const insightsRes = await fetchAdminInsights();
      setAdminStacks(insightsRes.stacks);
      setAdminCards(insightsRes.cards);
      setRatings(insightsRes.ratings);
      setSubmissions(insightsRes.submissions);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to load admin insights.');
    }
  }, []);

  const loadReviewData = useCallback(async () => {
    setReviewLoading(true);
    try {
      const reviewRes = await fetchAdminReviewSummary();
      setReviewSummary(reviewRes);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load friend review summary.',
      );
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminAuthStatus()
      .then((status) => {
        setAuthStatus(status);
      })
      .catch(() => {
        setAuthStatus({
          mode: 'local',
          configured: false,
          hasAdmin: false,
          authenticated: true,
          email: null,
        });
      });
  }, []);

  useEffect(() => {
    if (authStatus?.authenticated) {
      loadInsightsData();
      loadReviewData();
    }
  }, [authStatus?.authenticated, loadInsightsData, loadReviewData]);

  useEffect(() => {
    setCardsVisibleCount(50);
  }, [kindFilter, stackFilter, cardStatusFilter, deferredSearch]);

  useEffect(() => {
    setReviewVisibleCount(50);
  }, [reviewSubTab, reviewCategory, deferredReviewSearch]);

  const cardCountsByStack = useMemo(() => {
    const counts: Record<string, { active: number; total: number }> = {};
    for (const s of adminStacks) counts[s.id] = { active: 0, total: 0 };
    for (const c of adminCards) {
      if (!counts[c.stackId]) counts[c.stackId] = { active: 0, total: 0 };
      counts[c.stackId].total += 1;
      if (!c.archived) counts[c.stackId].active += 1;
    }
    return counts;
  }, [adminStacks, adminCards]);

  const cardKindCounts = useMemo(() => {
    const matchesStatus = (c: CardItem) => {
      if (cardStatusFilter === 'active') return !c.archived;
      if (cardStatusFilter === 'archived') return Boolean(c.archived);
      return true;
    };
    const scoped = adminCards.filter(matchesStatus);
    return {
      all: scoped.length,
      question: scoped.filter((c) => c.kind === 'question').length,
      quote: scoped.filter((c) => c.kind === 'quote').length,
      wildcard: scoped.filter((c) => c.kind === 'wildcard').length,
    };
  }, [adminCards, cardStatusFilter]);

  const filteredCards = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return adminCards.filter((c) => {
      if (cardStatusFilter === 'active' && c.archived) return false;
      if (cardStatusFilter === 'archived' && !c.archived) return false;
      if (stackFilter !== 'all' && c.stackId !== stackFilter) return false;
      if (kindFilter !== 'all' && c.kind !== kindFilter) return false;
      if (q) {
        return (
          c.de.toLowerCase().includes(q) ||
          c.en.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.author?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [adminCards, cardStatusFilter, stackFilter, kindFilter, deferredSearch]);

  const stackStatusCounts = useMemo(() => {
    return {
      all: adminStacks.length,
      active: adminStacks.filter((s) => !s.archived).length,
      archived: adminStacks.filter((s) => Boolean(s.archived)).length,
    };
  }, [adminStacks]);

  const filteredStacks = useMemo(() => {
    return adminStacks.filter((s) => {
      if (stackStatusFilter === 'active') return !s.archived;
      if (stackStatusFilter === 'archived') return Boolean(s.archived);
      return true;
    });
  }, [adminStacks, stackStatusFilter]);

  const sortedByRating = useMemo(() => {
    const withScores = adminCards
      .filter((c) => ratingSummary[c.id]?.total > 0)
      .map((c) => ({ card: c, score: ratingSummary[c.id] }));
    const best = [...withScores].sort((a, b) => b.score.net - a.score.net || b.score.up - a.score.up);
    const worst = [...withScores].sort((a, b) => a.score.net - b.score.net || a.score.down - b.score.down);
    return { best, worst };
  }, [adminCards, ratingSummary]);

  const stackRatingTotals = useMemo(() => {
    return adminStacks.map((stack) => {
      let up = 0;
      let down = 0;
      for (const c of adminCards) {
        if (c.stackId !== stack.id) continue;
        const sum = ratingSummary[c.id];
        if (sum) {
          up += sum.up;
          down += sum.down;
        }
      }
      const total = up + down;
      const pct = total > 0 ? Math.round((up / total) * 100) : null;
      return { stack, up, down, total, pct };
    });
  }, [adminStacks, adminCards, ratingSummary]);

  const inboxCounts = useMemo(() => {
    return {
      pending: submissions.filter((s) => s.status === 'pending').length,
      promoted: submissions.filter((s) => s.status === 'promoted').length,
      dismissed: submissions.filter((s) => s.status === 'dismissed').length,
    };
  }, [submissions]);

  const pendingInbox = useMemo(
    () => submissions.filter((s) => s.status === 'pending'),
    [submissions],
  );

  const filteredInbox = useMemo(() => {
    const q = deferredInboxSearch.trim().toLowerCase();
    return submissions.filter((s) => {
      if (s.status !== inboxStatusTab) return false;
      if (!q) return true;
      return (
        s.text.toLowerCase().includes(q) ||
        s.roomCode.toLowerCase().includes(q) ||
        (s.authorName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [submissions, inboxStatusTab, deferredInboxSearch]);

  const recommendedReviewIds = useMemo(() => {
    if (!reviewSummary) return new Set<string>();
    return computeRecommendedIdSet(reviewSummary.stats, reviewPreset);
  }, [reviewSummary, reviewPreset]);

  useEffect(() => {
    setSelectedReviewIds(new Set(recommendedReviewIds));
  }, [recommendedReviewIds]);

  const reviewOverview = useMemo(() => {
    const stats = reviewSummary?.stats || [];
    let ratedSuggestions = 0;
    let totalSuggestions = 0;
    let totalLive = 0;
    let pendingEdits = 0;
    for (const s of stats) {
      if (s.source === 'suggestion') {
        totalSuggestions += 1;
        if (s.voteCount > 0) ratedSuggestions += 1;
      } else {
        totalLive += 1;
      }
      pendingEdits += s.edits.filter((e) => !e.dismissed).length;
    }
    return { ratedSuggestions, totalSuggestions, totalLive, pendingEdits };
  }, [reviewSummary]);

  const filteredReviewStats = useMemo(() => {
    if (!reviewSummary || reviewSubTab === 'edits') return [];
    const q = deferredReviewSearch.trim().toLowerCase();
    const base = reviewSummary.stats.filter((item) => {
      if (item.source !== reviewSubTab) return false;
      if (reviewCategory !== 'all' && reviewCategoryKey(item.card) !== reviewCategory) {
        return false;
      }
      if (q) {
        return (
          item.card.de.toLowerCase().includes(q) ||
          item.card.en.toLowerCase().includes(q) ||
          item.cardId.toLowerCase().includes(q) ||
          (item.card.author?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
    return sortReviewStats(base);
  }, [reviewSummary, reviewSubTab, reviewCategory, deferredReviewSearch]);

  const visiblePendingEdits = useMemo(() => {
    if (!reviewSummary) return [];
    const q = deferredReviewSearch.trim().toLowerCase();
    const out: Array<{
      stat: AdminReviewSummary['stats'][number];
      edit: AdminReviewSummary['stats'][number]['edits'][number];
    }> = [];
    for (const stat of reviewSummary.stats) {
      if (reviewCategory !== 'all' && reviewCategoryKey(stat.card) !== reviewCategory) continue;
      for (const edit of stat.edits) {
        if (edit.dismissed) continue;
        if (q) {
          const matchesQuery =
            stat.cardId.toLowerCase().includes(q) ||
            edit.suggestedText.toLowerCase().includes(q) ||
            (edit.reviewerName?.toLowerCase().includes(q) ?? false) ||
            stat.card.de.toLowerCase().includes(q) ||
            stat.card.en.toLowerCase().includes(q);
          if (!matchesQuery) continue;
        }
        out.push({ stat, edit });
      }
    }
    return out;
  }, [reviewSummary, reviewCategory, deferredReviewSearch]);

  const selectedVisibleReviewIds = useMemo(() => {
    if (reviewSubTab !== 'suggestion') return [];
    return filteredReviewStats
      .filter((s) => !s.promoted && selectedReviewIds.has(s.cardId))
      .map((s) => s.cardId);
  }, [filteredReviewStats, selectedReviewIds, reviewSubTab]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, cardsVisibleCount),
    [filteredCards, cardsVisibleCount],
  );

  const visibleReviewStats = useMemo(
    () => filteredReviewStats.slice(0, reviewVisibleCount),
    [filteredReviewStats, reviewVisibleCount],
  );

  const notifyOk = (msg: string) => {
    setErrorBanner('');
    setStatusBanner(msg);
  };

  const notifyErr = (err: unknown) => {
    setStatusBanner('');
    setErrorBanner(err instanceof Error ? err.message : 'Action failed.');
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.all([loadInsightsData(), loadReviewData(), refreshCatalog()]);
      notifyOk(isDe ? 'Daten synchronisiert.' : 'Synced with backend.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setSyncing(false);
    }
  };

  const openCardEditor = (
    card: CardItem,
    pendingEdits?: AdminReviewSummary['stats'][number]['edits'],
    dismissEditId?: string,
  ) => {
    setEditingCard({
      card: { ...card },
      pendingEdits,
      dismissEditId,
    });
  };

  const openQuickNewCard = (kind: CardKind) => {
    const defaultStack =
      kind === 'quote'
        ? quotesStackId
        : stackFilter !== 'all'
          ? stackFilter
          : firstStackId;
    openCardEditor({
      id: `C_${Date.now()}`,
      stackId: defaultStack,
      kind,
      de: '',
      en: '',
      isCustom: true,
    });
    setMobileNavOpen(false);
  };

  const openQuickNewStack = () => {
    setEditingStack({
      isNew: true,
      stack: {
        id: '',
        ring: adminStacks.length + 1,
        iconId: 'reflection',
        nameDe: '',
        nameEn: '',
        subtitleDe: '',
        subtitleEn: '',
        accent: 'var(--accent)',
        accentSoft: 'var(--accent-soft)',
        archived: false,
      },
    });
    setMobileNavOpen(false);
  };

  const handleToggleSelectReviewCard = (cardId: string) => {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handlePromoteReviewIds = async (ids: string[]) => {
    if (ids.length === 0 || busyAction) return;
    setBusyAction(true);
    try {
      const res = await promoteReviewSuggestions(ids.map((id) => ({ id })));
      await Promise.all([loadInsightsData(), loadReviewData()]);
      notifyOk(
        isDe
          ? `${res.addedCount} ausgewählte Vorschläge auf die Live-Website übernommen.`
          : `Added ${res.addedCount} reviewed suggestions to the live website.`,
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSuggestionDraft = async (card: CardItem) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const saved = await saveReviewSuggestionDraft(card);
      setReviewSummary((prev) => {
        if (!prev) return prev;
        const nextEdited = new Set(prev.editedSuggestionIds || []);
        nextEdited.add(saved.id);
        return {
          ...prev,
          editedSuggestionIds: [...nextEdited],
          stats: prev.stats.map((s) => (s.cardId === saved.id ? { ...s, card: saved } : s)),
        };
      });
      setEditingSuggestion(null);
      notifyOk(isDe ? 'Vorschlag als Entwurf gespeichert.' : 'Saved suggestion draft.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handlePublishEditedSuggestion = async (card: CardItem, dismissEditId?: string) => {
    if (busyAction) return;
    if (!card.de.trim() || !card.en.trim()) {
      notifyErr(
        new Error(
          isDe
            ? 'Deutscher und englischer Text sind erforderlich.'
            : 'Both German and English card text are required.',
        ),
      );
      return;
    }
    setBusyAction(true);
    try {
      await promoteReviewSuggestions([card], dismissEditId ? [dismissEditId] : undefined);
      await Promise.all([loadInsightsData(), loadReviewData()]);
      setEditingSuggestion(null);
      notifyOk(
        isDe
          ? 'Bearbeiteter Vorschlag live geschaltet.'
          : 'Edited suggestion published to live deck.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleApplySuggestedEdit = async (
    cardId: string,
    language: 'de' | 'en',
    newText: string,
    editId: string,
  ) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await applyReviewEditSuggestion({ cardId, language, newText, editId });
      await Promise.all([loadInsightsData(), loadReviewData()]);
      notifyOk(
        isDe
          ? 'Formulierung übernommen und auf Live-Karte gespeichert.'
          : 'Suggested wording applied to live deck.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDismissSuggestedEdit = async (editId: string) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await dismissReviewEditSuggestion(editId);
      setReviewSummary((prev) => {
        if (!prev) return prev;
        const nextDismissed = new Set(prev.dismissedEditIds);
        nextDismissed.add(editId);
        return {
          ...prev,
          dismissedEditIds: [...nextDismissed],
          stats: prev.stats.map((s) =>
            s.edits.some((ed) => ed.id === editId)
              ? {
                  ...s,
                  edits: s.edits.map((ed) =>
                    ed.id === editId ? { ...ed, dismissed: true } : ed,
                  ),
                }
              : s,
          ),
        };
      });
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleCopyReviewUrl = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/review`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedReviewLink(true);
      setTimeout(() => setCopiedReviewLink(false), 1800);
    } catch {
      notifyOk(url);
    }
  };

  // ---------- Auth Handlers ----------

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (password.length < 8) {
      setAuthError(
        isDe
          ? 'Passwort muss mindestens 8 Zeichen lang sein.'
          : 'Password must be at least 8 characters.',
      );
      return;
    }
    if (password !== confirmPassword) {
      setAuthError(isDe ? 'Passwörter stimmen nicht überein.' : 'Passwords do not match.');
      return;
    }

    setAuthBusy(true);
    try {
      const res = await setupAdmin(claimEmail, password);
      setPassword('');
      setConfirmPassword('');
      setAuthStatus({
        mode: 'vercel',
        configured: true,
        hasAdmin: true,
        authenticated: true,
        email: res.email,
      });
      await Promise.all([loadInsightsData(), loadReviewData()]);
      notifyOk(
        isDe
          ? 'Admin-Zugang aktiviert. Du bist jetzt angemeldet.'
          : 'Admin account claimed. Setup is now locked to your credentials.',
      );
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const res = await loginAdmin(loginEmail, password);
      setPassword('');
      setAuthStatus((prev) =>
        prev
          ? { ...prev, authenticated: true, hasAdmin: true, email: res.email }
          : {
              mode: 'vercel',
              configured: true,
              hasAdmin: true,
              authenticated: true,
              email: res.email,
            },
      );
      loadInsightsData();
      loadReviewData();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setAuthStatus((prev) => (prev ? { ...prev, authenticated: false, email: null } : prev));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      notifyErr(
        new Error(
          isDe
            ? 'Das neue Passwort muss mindestens 8 Zeichen haben.'
            : 'New password must be at least 8 characters.',
        ),
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      notifyErr(
        new Error(isDe ? 'Neue Passwörter stimmen nicht überein.' : 'New passwords do not match.'),
      );
      return;
    }
    setBusyAction(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      notifyOk(isDe ? 'Admin-Passwort aktualisiert.' : 'Admin password updated.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  // ---------- Card Handlers ----------

  const handleSaveCard = async (card: CardItem, dismissEditId?: string) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const saved = await upsertCard(card);
      if (dismissEditId) {
        await dismissReviewEditSuggestion(dismissEditId);
      }
      setAdminCards((prev) =>
        prev.some((c) => c.id === saved.id)
          ? prev.map((c) => (c.id === saved.id ? saved : c))
          : [saved, ...prev],
      );
      setReviewSummary((prev) => {
        if (!prev) return prev;
        const nextDismissed = dismissEditId
          ? [...new Set([...prev.dismissedEditIds, dismissEditId])]
          : prev.dismissedEditIds;
        return {
          ...prev,
          dismissedEditIds: nextDismissed,
          stats: prev.stats.map((s) =>
            s.cardId === saved.id
              ? {
                  ...s,
                  card: saved,
                  edits: dismissEditId
                    ? s.edits.map((ed) =>
                        ed.id === dismissEditId ? { ...ed, dismissed: true } : ed,
                      )
                    : s.edits,
                }
              : s,
          ),
        };
      });
      setEditingCard(null);
      notifyOk(isDe ? 'Karte gespeichert.' : 'Card saved.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleArchiveToggle = async (card: CardItem) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const updated = await archiveCard(card.id, !card.archived);
      setAdminCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setReviewSummary((prev) =>
        prev
          ? {
              ...prev,
              stats: prev.stats.map((s) =>
                s.cardId === updated.id ? { ...s, card: updated } : s,
              ),
            }
          : prev,
      );
      notifyOk(
        card.archived
          ? isDe
            ? 'Karte wiederhergestellt.'
            : 'Card restored.'
          : isDe
            ? 'Karte archiviert.'
            : 'Card archived.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await deleteCard(id);
      setConfirmDeleteCardId(null);
      setAdminCards((prev) => prev.filter((c) => c.id !== id));
      setReviewSummary((prev) =>
        prev
          ? {
              ...prev,
              promotedIds: prev.promotedIds.filter((pid) => pid !== id),
              stats: prev.stats.map((s) =>
                s.cardId === id && s.source === 'suggestion' ? { ...s, promoted: false } : s,
              ),
            }
          : prev,
      );
      notifyOk(isDe ? `Karte ${id} gelöscht.` : `Deleted card ${id}.`);
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  // ---------- Stack Handlers ----------

  const handleSaveStack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStack || busyAction) return;
    setBusyAction(true);
    try {
      const nextStacks = await upsertStack(editingStack.stack);
      setAdminStacks(nextStacks);
      setEditingStack(null);
      notifyOk(
        editingStack.isNew
          ? isDe
            ? 'Neuer Stapel angelegt.'
            : 'Created new stack.'
          : isDe
            ? 'Stapel aktualisiert.'
            : 'Stack updated.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleMoveStackOrder = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= filteredStacks.length || busyAction) return;
    const copy = adminStacks.slice();
    const currentId = filteredStacks[index].id;
    const targetId = filteredStacks[target].id;
    const realIndex = copy.findIndex((s) => s.id === currentId);
    const realTarget = copy.findIndex((s) => s.id === targetId);
    if (realIndex < 0 || realTarget < 0) return;

    const [item] = copy.splice(realIndex, 1);
    copy.splice(realTarget, 0, item);
    setBusyAction(true);
    try {
      const next = await reorderStacks(copy.map((s) => s.id));
      setAdminStacks(next);
      notifyOk(isDe ? 'Reihenfolge gespeichert.' : 'Stack order updated.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleArchiveStackToggle = async (stack: StackMeta) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const next = await archiveStack(stack.id, !stack.archived);
      setAdminStacks(next);
      notifyOk(
        stack.archived
          ? isDe
            ? 'Stapel aktiviert.'
            : 'Stack restored.'
          : isDe
            ? 'Stapel archiviert.'
            : 'Stack archived.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const openDeleteStackModal = (stack: StackMeta) => {
    const count = cardCountsByStack[stack.id]?.total || 0;
    const fallback =
      adminStacks.find((s) => s.id !== stack.id && !s.archived) ??
      adminStacks.find((s) => s.id !== stack.id);
    if (!fallback) {
      notifyErr(
        new Error(isDe ? 'Mindestens ein Stapel muss bleiben.' : 'At least one stack must remain.'),
      );
      return;
    }
    setDeletingStack({
      stack,
      cardCount: count,
      reassignTo: fallback.id,
    });
  };

  const handleConfirmDeleteStack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingStack || busyAction) return;
    setBusyAction(true);
    try {
      const next = await deleteStack(
        deletingStack.stack.id,
        deletingStack.cardCount > 0 ? deletingStack.reassignTo : undefined,
      );
      setAdminStacks(next);
      if (deletingStack.cardCount > 0) {
        const deletedId = deletingStack.stack.id;
        const targetId = deletingStack.reassignTo;
        setAdminCards((prev) =>
          prev.map((c) => (c.stackId === deletedId ? { ...c, stackId: targetId } : c)),
        );
      }
      if (stackFilter === deletingStack.stack.id) setStackFilter('all');
      notifyOk(
        deletingStack.cardCount > 0
          ? isDe
            ? `Stapel gelöscht und ${deletingStack.cardCount} Karten verschoben.`
            : `Deleted stack and reassigned ${deletingStack.cardCount} cards.`
          : isDe
            ? 'Stapel gelöscht.'
            : 'Stack deleted.',
      );
      setDeletingStack(null);
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  // ---------- Inbox & Reseed & Export ----------

  const handleSaveInboxDraft = async (input: {
    id: string;
    text: string;
    language: Language;
    authorName?: string;
    promotedStackId?: StackId;
  }) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const updated = await editGroupSubmission(input);
      setSubmissions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingSubmission(null);
      notifyOk(isDe ? 'Einreichung aktualisiert.' : 'Submission draft saved.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handlePromoteInboxSubmission = async (submissionId: string, card: CardItem) => {
    if (busyAction) return;
    if (!card.stackId.trim()) {
      notifyErr(
        new Error(
          isDe
            ? 'Bitte zuerst eine Kategorie (Stapel) wählen.'
            : 'Please choose a category (stack) first.',
        ),
      );
      return;
    }
    if (!card.de.trim() || !card.en.trim()) {
      notifyErr(
        new Error(
          isDe
            ? 'Deutscher und englischer Text sind erforderlich.'
            : 'Both German and English card text are required.',
        ),
      );
      return;
    }
    setBusyAction(true);
    try {
      await updateSubmissionStatus(submissionId, 'promoted', card.stackId, card);
      await loadInsightsData();
      setEditingSubmission(null);
      notifyOk(
        isDe ? 'Frage dauerhaft in Stapel aufgenommen.' : 'Question promoted to permanent deck.',
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDismissSubmission = async (id: string) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await updateSubmissionStatus(id, 'dismissed');
      setSubmissions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'dismissed' } : item)),
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleReseedMissing = async () => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const res = await reseedMissingCards();
      await loadInsightsData();
      const updated = res.updatedCount ?? 0;
      notifyOk(
        isDe
          ? `${res.addedCount} fehlende Standardkarten wiederhergestellt, ${updated} Quellen aktualisiert (${res.total} gesamt).`
          : `Restored ${res.addedCount} missing baseline cards, refreshed ${updated} quote sources (${res.total} total).`,
      );
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const exportCsv = () => {
    const header = ['id', 'stack', 'kind', 'up', 'down', 'net', 'text_de', 'text_en'];
    const rows = adminCards.map((c) => {
      const s = ratingSummary[c.id] || { up: 0, down: 0, net: 0 };
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [c.id, c.stackId, c.kind, s.up, s.down, s.net, esc(c.de), esc(c.en)].join(',');
    });
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance-ratings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      stacks: adminStacks,
      cards: adminCards,
      ratings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Minimal Top Bar for Auth Gates ----------

  const authUtilityHeader = (
    <header
      className="h-14 border-b px-4 sm:px-6 flex items-center justify-between"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer hover:opacity-80"
        style={{ color: 'var(--ink)' }}
      >
        <ConcentricLogo size={24} />
        <span className="font-semibold tracking-tight">Resonance</span>
        <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Studio
        </span>
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border cursor-pointer hover:bg-[var(--elevated)]"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}
        >
          <ExternalLink size={13} />
          <span>{isDe ? 'Zur Webseite' : 'Back to App'}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer hover:bg-[var(--elevated)]"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          type="button"
          onClick={toggleLang}
          className="h-8 px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer hover:bg-[var(--elevated)]"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          {lang.toUpperCase()}
        </button>
      </div>
    </header>
  );

  // ---------- Render: Auth / Loading ----------

  if (!authStatus) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
        {authUtilityHeader}
        <main
          className="flex-1 flex items-center justify-center px-4 text-sm"
          style={{ color: 'var(--ink-muted)' }}
        >
          {isDe ? 'Lade Studio…' : 'Loading Studio…'}
        </main>
      </div>
    );
  }

  if (authStatus.mode === 'vercel' && !authStatus.configured) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
        {authUtilityHeader}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md noble-bezel p-1.5 rounded-[28px]">
            <div className="noble-card rounded-[22px] p-6 sm:p-7 space-y-3">
              <h1 className="font-serif-card text-2xl font-medium m-0">
                {isDe ? 'Server-Konfiguration fehlt' : 'Storage Secret Required'}
              </h1>
              <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
                {isDe
                  ? 'Vercel Blob oder ADMIN_SESSION_SECRET ist noch nicht verbunden.'
                  : 'BLOB_READ_WRITE_TOKEN or ADMIN_SESSION_SECRET is missing on this deployment.'}
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (authStatus.mode === 'vercel' && !authStatus.authenticated) {
    if (!authStatus.hasAdmin) {
      return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
          {authUtilityHeader}
          <main className="flex-1 flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md noble-bezel p-1.5 rounded-[28px]">
              <form
                onSubmit={handleClaimAdmin}
                className="noble-card relative rounded-[22px] p-6 sm:p-7 space-y-4"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2.5 rounded-[14px] border"
                  style={{ borderColor: 'var(--gold-hairline)' }}
                />
                <div className="relative z-10 space-y-4">
                  <div className="space-y-1">
                    <span
                      className="inline-block text-[11px] uppercase tracking-[0.14em]"
                      style={{ color: 'var(--gold)' }}
                    >
                      {isDe ? 'Einmalige Einrichtung' : 'One-Time Setup'}
                    </span>
                    <h1 className="font-serif-card text-2xl font-medium m-0">
                      {isDe ? 'Kurator-Studio aktivieren' : 'Activate Curator Studio'}
                    </h1>
                    <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe
                        ? 'Lege einmalig dein Admin-Passwort fest. Danach ist die Ersteinrichtung dauerhaft gesperrt.'
                        : 'Set your curator password once. After activation, public setup locks permanently.'}
                    </p>
                  </div>

                  {authError && (
                    <div
                      className="text-xs px-3.5 py-2.5 rounded-xl"
                      style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                    >
                      {authError}
                    </div>
                  )}

                  <label className="block space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Email
                    </span>
                    <input
                      type="email"
                      required
                      value={claimEmail}
                      onChange={(e) => setClaimEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-full px-4 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {isDe ? 'Passwort (mind. 8 Zeichen)' : 'Password (min. 8 characters)'}
                    </span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-full px-4 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {isDe ? 'Passwort bestätigen' : 'Confirm password'}
                    </span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-full px-4 py-2.5 text-sm"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full py-3 rounded-full text-sm font-medium cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    {authBusy
                      ? isDe
                        ? 'Aktiviere…'
                        : 'Activating…'
                      : isDe
                        ? 'Admin anlegen & Studio öffnen'
                        : 'Create Admin & Enter Studio'}
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
        {authUtilityHeader}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md noble-bezel p-1.5 rounded-[28px]">
            <form
              onSubmit={handleLogin}
              className="noble-card relative rounded-[22px] p-6 sm:p-7 space-y-4"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-2.5 rounded-[14px] border"
                style={{ borderColor: 'var(--gold-hairline)' }}
              />
              <div className="relative z-10 space-y-4">
                <div className="space-y-1">
                  <h1 className="font-serif-card text-2xl font-medium m-0">
                    {isDe ? 'Kurator-Anmeldung' : 'Curator Sign In'}
                  </h1>
                  <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                    {isDe
                      ? 'Melde dich an, um Stapel, Fragen und Bewertungen zu verwalten.'
                      : 'Sign in with your curator credentials to manage stacks, cards, and ratings.'}
                  </p>
                </div>
                {authError && (
                  <div
                    className="text-xs px-3.5 py-2 rounded-xl"
                    style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    {authError}
                  </div>
                )}
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-full px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-full px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full py-3 rounded-full text-sm font-medium cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  {authBusy ? (isDe ? 'Prüfe…' : 'Signing in…') : isDe ? 'Anmelden' : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Portal Navigation Configuration ----------

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'cards',
      label: isDe ? 'Karten' : 'Cards',
      icon: <BookOpen size={16} />,
      badge: adminCards.length,
    },
    {
      id: 'stacks',
      label: isDe ? 'Stapel' : 'Stacks',
      icon: <Layers size={16} />,
      badge: adminStacks.length,
    },
    {
      id: 'review',
      label: isDe ? 'Prüfung' : 'Friend Review',
      icon: <FileCheck2 size={16} />,
      badge: reviewOverview.ratedSuggestions + reviewOverview.pendingEdits,
    },
    {
      id: 'inbox',
      label: isDe ? 'Runden-Eingang' : 'Group Inbox',
      icon: <Inbox size={16} />,
      badge: pendingInbox.length,
    },
    {
      id: 'insights',
      label: isDe ? 'Auswertung' : 'Insights',
      icon: <BarChart3 size={16} />,
      badge: ratings.length,
    },
    {
      id: 'security',
      label: isDe ? 'Betrieb & Sync' : 'Settings & Sync',
      icon: <Settings size={16} />,
    },
  ];

  const activeNavTitle = navItems.find((n) => n.id === tab)?.label ?? 'Studio';

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 text-left cursor-pointer hover:opacity-85"
          style={{ color: 'var(--ink)' }}
        >
          <ConcentricLogo size={26} />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Resonance</div>
            <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              Studio
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
          className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable Nav + Quick Create */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div className="space-y-1">
          <div
            className="px-2.5 pb-1 text-[11px] font-medium"
            style={{ color: 'var(--ink-soft)' }}
          >
            {isDe ? 'Arbeitsbereich' : 'Workspace'}
          </div>
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileNavOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--elevated)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-muted)',
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span style={{ color: active ? 'var(--accent)' : 'var(--ink-soft)' }}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] tabular-nums shrink-0"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--card)',
                      color: active ? 'var(--accent)' : 'var(--ink-muted)',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t pt-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div
            className="px-2.5 text-[11px] font-medium"
            style={{ color: 'var(--ink-soft)' }}
          >
            {isDe ? 'Schnellerstellung' : 'Quick Create'}
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-0.5">
            <button
              type="button"
              onClick={() => openQuickNewCard('question')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--ink)',
                backgroundColor: 'var(--card)',
              }}
            >
              <Plus size={12} style={{ color: 'var(--accent)' }} />
              <span className="truncate">{isDe ? 'Frage' : 'Question'}</span>
            </button>
            <button
              type="button"
              onClick={() => openQuickNewCard('quote')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--ink)',
                backgroundColor: 'var(--card)',
              }}
            >
              <Plus size={12} style={{ color: 'var(--accent)' }} />
              <span className="truncate">{isDe ? 'Zitat' : 'Quote'}</span>
            </button>
            <button
              type="button"
              onClick={() => openQuickNewCard('wildcard')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--ink)',
                backgroundColor: 'var(--card)',
              }}
            >
              <Plus size={12} style={{ color: 'var(--accent)' }} />
              <span className="truncate">{isDe ? 'Impuls' : 'Wildcard'}</span>
            </button>
            <button
              type="button"
              onClick={openQuickNewStack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--ink)',
                backgroundColor: 'var(--card)',
              }}
            >
              <Plus size={12} style={{ color: 'var(--accent)' }} />
              <span className="truncate">{isDe ? 'Stapel' : 'Stack'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pinned Footer */}
      <div className="p-3 border-t space-y-3 shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              backgroundColor: 'var(--card)',
            }}
          >
            <ExternalLink size={12} />
            <span className="truncate">{isDe ? 'Zur Webseite' : 'Back to App'}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer hover:bg-[var(--elevated)] shrink-0"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--ink-muted)',
              backgroundColor: 'var(--card)',
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            type="button"
            onClick={toggleLang}
            className="h-8 px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer hover:bg-[var(--elevated)] shrink-0"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              backgroundColor: 'var(--card)',
            }}
          >
            {lang.toUpperCase()}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{
                backgroundColor: 'var(--elevated)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            >
              {getInitials(authStatus.email)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">
                  {authStatus.email ? authStatus.email.split('@')[0] : 'Curator'}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  {authStatus.mode === 'vercel' ? 'Admin' : 'Local'}
                </span>
              </div>
              <div className="text-[11px] truncate" style={{ color: 'var(--ink-soft)' }}>
                {authStatus.email || (isDe ? 'Lokale Sitzung' : 'Browser session')}
              </div>
            </div>
          </div>

          {authStatus.mode === 'vercel' && (
            <button
              type="button"
              onClick={handleLogout}
              title={isDe ? 'Abmelden' : 'Sign out'}
              aria-label={isDe ? 'Abmelden' : 'Sign out'}
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--elevated)] shrink-0"
              style={{ color: 'var(--ink-muted)' }}
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- Render: Authenticated Portal Shell ----------

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r transition-all duration-200 overflow-hidden ${
          sidebarCollapsed ? 'w-0 border-r-0' : 'w-[252px]'
        }`}
        style={{ backgroundColor: 'var(--subtle)', borderColor: 'var(--border)' }}
      >
        {!sidebarCollapsed && renderSidebarContent()}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0"
            style={{ backgroundColor: 'var(--scrim)' }}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="relative z-10 w-[264px] max-w-[85vw] h-full border-r flex flex-col"
            style={{ backgroundColor: 'var(--subtle)', borderColor: 'var(--border)' }}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Right Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Top Utility Bar */}
        <header
          className="h-14 sticky top-0 z-20 border-b px-4 sm:px-6 flex items-center justify-between gap-3 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'color-mix(in srgb, var(--bg) 90%, transparent)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label="Toggle sidebar"
              className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center cursor-pointer hover:bg-[var(--elevated)]"
              style={{ color: 'var(--ink-muted)' }}
            >
              <PanelLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--elevated)]"
              style={{ color: 'var(--ink-muted)' }}
            >
              <Menu size={16} />
            </button>
            <span className="h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
            <span className="text-sm font-medium truncate">{activeNavTitle}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--subtle)',
                color: authStatus.mode === 'vercel' ? 'var(--accent)' : 'var(--ink-muted)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    authStatus.mode === 'vercel' ? 'var(--accent)' : 'var(--ink-soft)',
                }}
              />
              {authStatus.mode === 'vercel' ? 'Vercel Blob' : isDe ? 'Lokal' : 'Local'}
            </span>

            <button
              type="button"
              disabled={syncing}
              onClick={handleSync}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)] disabled:opacity-60"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
              }}
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{isDe ? 'Cloud Sync' : 'Sync'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/review')}
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink-muted)',
              }}
            >
              <ExternalLink size={13} />
              <span>/review</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6 pb-20 space-y-5">
          {statusBanner && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs flex items-center justify-between border"
              style={{
                backgroundColor: 'var(--accent-soft)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              <span>{statusBanner}</span>
              <button
                type="button"
                onClick={() => setStatusBanner('')}
                className="underline cursor-pointer"
              >
                OK
              </button>
            </div>
          )}

          {errorBanner && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs flex items-center justify-between border"
              style={{
                backgroundColor: 'var(--danger-soft)',
                borderColor: 'var(--danger)',
                color: 'var(--danger)',
              }}
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner('')}
                className="underline cursor-pointer"
              >
                OK
              </button>
            </div>
          )}

          {/* SECTION 1: CARDS (Katalog Pattern) */}
          {tab === 'cards' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight m-0">
                    {isDe ? 'Karten' : 'Cards'}
                  </h1>
                  <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                    {isDe
                      ? 'Alle veröffentlichten Fragen, Zitate und Impulse. Klicke auf einen Eintrag, um ihn live zu bearbeiten.'
                      : 'All published questions, quotes, and wildcards. Click any row to edit live.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openQuickNewCard('question')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  <Plus size={14} />
                  <span>{isDe ? 'Neue Karte' : 'New Card'}</span>
                </button>
              </div>

              {/* Underline Sub-Tabs by Kind */}
              <div
                className="flex items-center gap-5 border-b overflow-x-auto no-scrollbar"
                style={{ borderColor: 'var(--border)' }}
              >
                {(
                  [
                    ['all', isDe ? 'Alle' : 'All', cardKindCounts.all],
                    ['question', isDe ? 'Fragen' : 'Questions', cardKindCounts.question],
                    ['quote', isDe ? 'Zitate' : 'Quotes', cardKindCounts.quote],
                    ['wildcard', isDe ? 'Impulse' : 'Wildcards', cardKindCounts.wildcard],
                  ] as [CardKind | 'all', string, number][]
                ).map(([key, label, count]) => {
                  const active = kindFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKindFilter(key)}
                      className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                      style={{ color: active ? 'var(--ink)' : 'var(--ink-muted)' }}
                    >
                      <span>{label}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
                        style={{
                          backgroundColor: active ? 'var(--ink)' : 'var(--elevated)',
                          color: active ? 'var(--bg)' : 'var(--ink-muted)',
                        }}
                      >
                        {count}
                      </span>
                      {active && (
                        <span
                          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Unified Bordered Table Container */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {/* Toolbar */}
                <div
                  className="p-3 border-b flex flex-wrap items-center gap-2.5"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
                >
                  <div className="relative flex-1 min-w-[200px]">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--ink-soft)' }}
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={
                        isDe ? 'Karten durchsuchen…' : 'Search cards, IDs, or authors…'
                      }
                      className="w-full h-9 rounded-lg pl-9 pr-3 text-xs"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>

                  <select
                    value={stackFilter}
                    onChange={(e) => setStackFilter(e.target.value)}
                    aria-label="Filter by stack"
                    className="h-9 rounded-lg px-3 text-xs"
                    style={{
                      backgroundColor: 'var(--card)',
                      color: 'var(--ink)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <option value="all">{isDe ? 'Alle Stapel' : 'All stacks'}</option>
                    {adminStacks.map((s) => (
                      <option key={s.id} value={s.id}>
                        {isDe ? s.nameDe : s.nameEn}
                      </option>
                    ))}
                  </select>

                  <div
                    className="inline-flex p-0.5 rounded-lg border text-xs"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    {(
                      [
                        ['active', isDe ? 'Aktiv' : 'Active'],
                        ['archived', isDe ? 'Archiv' : 'Archived'],
                        ['all', isDe ? 'Alle' : 'All'],
                      ] as [CardStatusFilter, string][]
                    ).map(([key, label]) => {
                      const active = cardStatusFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCardStatusFilter(key)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active ? 'var(--elevated)' : 'transparent',
                            color: active ? 'var(--ink)' : 'var(--ink-muted)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divided List Rows */}
                {filteredCards.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      {isDe ? 'Keine Karten in dieser Ansicht' : 'No cards match this view'}
                    </div>
                    <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe
                        ? 'Passe Suche, Stapel oder Statusfilter an.'
                        : 'Try clearing the search query or changing filters.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {visibleCards.map((card) => {
                        const stack = getStackMetaSafe(stackMap, card.stackId);
                        const score = ratingSummary[card.id];
                        const awaitingConfirm = confirmDeleteCardId === card.id;
                        const primaryText = isDe ? card.de : card.en;
                        const secondaryText = isDe ? card.en : card.de;
                        return (
                          <div
                            key={card.id}
                            onClick={() => openCardEditor(card)}
                            className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer hover:bg-[var(--subtle)] transition-colors"
                            style={{
                              borderColor: 'var(--border)',
                              opacity: card.archived ? 0.65 : 1,
                            }}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium line-clamp-1">
                                  {primaryText}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                                  style={{
                                    backgroundColor: 'var(--subtle)',
                                    color: 'var(--ink-muted)',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  {isDe ? stack.nameDe : stack.nameEn}
                                </span>
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                                  style={{
                                    backgroundColor: card.archived
                                      ? 'var(--elevated)'
                                      : 'var(--accent-soft)',
                                    color: card.archived ? 'var(--ink-muted)' : 'var(--accent)',
                                  }}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{
                                      backgroundColor: card.archived
                                        ? 'var(--ink-soft)'
                                        : 'var(--accent)',
                                    }}
                                  />
                                  {card.archived ? (isDe ? 'Archiv' : 'Archived') : 'Live'}
                                </span>
                                {score && (
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[11px] tabular-nums"
                                    style={{
                                      backgroundColor: 'var(--subtle)',
                                      color: 'var(--ink-muted)',
                                    }}
                                  >
                                    +{score.up} / -{score.down}
                                  </span>
                                )}
                              </div>

                              <div
                                className="text-xs truncate"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {card.kind}
                                {card.author ? ` · ${card.author}` : ''} · {secondaryText}
                              </div>
                            </div>

                            <div
                              className="flex flex-wrap items-center gap-2 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span
                                className="hidden md:inline text-[11px] font-mono"
                                style={{ color: 'var(--ink-soft)' }}
                              >
                                {card.id}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleArchiveToggle(card)}
                                disabled={busyAction}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[var(--elevated)]"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {card.archived
                                  ? isDe
                                    ? 'Aktivieren'
                                    : 'Restore'
                                  : isDe
                                    ? 'Archiv'
                                    : 'Archive'}
                              </button>

                              {awaitingConfirm ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCard(card.id)}
                                    disabled={busyAction}
                                    className="px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer"
                                    style={{
                                      backgroundColor: 'var(--danger-soft)',
                                      color: 'var(--danger)',
                                    }}
                                  >
                                    {isDe ? 'Löschen?' : 'Confirm?'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCardId(null)}
                                    className="px-2 py-1 rounded-lg text-[11px] cursor-pointer"
                                    style={{ color: 'var(--ink-muted)' }}
                                  >
                                    {isDe ? 'Nein' : 'No'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCardId(card.id)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer hover:opacity-80"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  {isDe ? 'Löschen' : 'Delete'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openCardEditor(card)}
                                aria-label={`Edit ${card.id}`}
                                className="p-1 rounded-lg cursor-pointer hover:bg-[var(--elevated)]"
                                style={{ color: 'var(--ink-soft)' }}
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {filteredCards.length > visibleCards.length && (
                      <div
                        className="px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
                      >
                        <span style={{ color: 'var(--ink-muted)' }}>
                          {isDe
                            ? `Zeige ${visibleCards.length} von ${filteredCards.length} Karten`
                            : `Showing ${visibleCards.length} of ${filteredCards.length} cards`}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCardsVisibleCount((c) => c + 50)}
                            className="px-3 py-1.5 rounded-lg border font-medium cursor-pointer hover:bg-[var(--elevated)]"
                            style={{
                              borderColor: 'var(--border)',
                              backgroundColor: 'var(--card)',
                              color: 'var(--ink)',
                            }}
                          >
                            {isDe ? '50 mehr laden' : 'Load 50 more'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCardsVisibleCount(filteredCards.length)}
                            className="px-3 py-1.5 rounded-lg font-medium cursor-pointer hover:bg-[var(--elevated)]"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {isDe ? 'Alle anzeigen' : 'Show all'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* SECTION 2: STACKS */}
          {tab === 'stacks' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight m-0">
                    {isDe ? 'Stapel' : 'Stacks'}
                  </h1>
                  <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                    {isDe
                      ? 'Erstelle neue Stapel, benenne bestehende um, ändere die Reihenfolge oder verschiebe Karten.'
                      : 'Create custom stacks, rename bilingual titles, pick emblems, or reorder the grid.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openQuickNewStack}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  <Plus size={14} />
                  <span>{isDe ? 'Neuer Stapel' : 'New Stack'}</span>
                </button>
              </div>

              <div
                className="flex items-center gap-5 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                {(
                  [
                    ['all', isDe ? 'Alle' : 'All', stackStatusCounts.all],
                    ['active', isDe ? 'Aktiv' : 'Active', stackStatusCounts.active],
                    ['archived', isDe ? 'Archiviert' : 'Archived', stackStatusCounts.archived],
                  ] as [StackStatusFilter, string, number][]
                ).map(([key, label, count]) => {
                  const active = stackStatusFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStackStatusFilter(key)}
                      className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium cursor-pointer transition-colors"
                      style={{ color: active ? 'var(--ink)' : 'var(--ink-muted)' }}
                    >
                      <span>{label}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
                        style={{
                          backgroundColor: active ? 'var(--ink)' : 'var(--elevated)',
                          color: active ? 'var(--bg)' : 'var(--ink-muted)',
                        }}
                      >
                        {count}
                      </span>
                      {active && (
                        <span
                          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {filteredStacks.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-1">
                    <div className="text-sm font-medium">
                      {isDe ? 'Keine Stapel in dieser Ansicht' : 'No stacks in this view'}
                    </div>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {filteredStacks.map((stack, index) => {
                      const counts = cardCountsByStack[stack.id] || { active: 0, total: 0 };
                      return (
                        <div
                          key={stack.id}
                          className="px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[var(--subtle)] transition-colors"
                          style={{
                            borderColor: 'var(--border)',
                            opacity: stack.archived ? 0.65 : 1,
                          }}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                              style={{
                                backgroundColor: 'var(--subtle)',
                                borderColor: 'var(--gold-hairline)',
                                color: 'var(--gold)',
                              }}
                            >
                              <StackArtwork
                                stackId={stack.id}
                                iconId={stack.iconId}
                                size={20}
                              />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  {isDe ? stack.nameDe : stack.nameEn}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                                  / {isDe ? stack.nameEn : stack.nameDe}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-md text-[11px] font-mono"
                                  style={{
                                    backgroundColor: 'var(--subtle)',
                                    color: 'var(--ink-soft)',
                                  }}
                                >
                                  #{stack.id} · Ring {stack.ring}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
                                  style={{
                                    backgroundColor: 'var(--accent-soft)',
                                    color: 'var(--accent)',
                                  }}
                                >
                                  {counts.active}/{counts.total}
                                </span>
                                {stack.archived && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[11px]"
                                    style={{
                                      backgroundColor: 'var(--elevated)',
                                      color: 'var(--ink-muted)',
                                    }}
                                  >
                                    {isDe ? 'Archiviert' : 'Archived'}
                                  </span>
                                )}
                              </div>
                              <p
                                className="text-xs m-0 truncate"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {isDe ? stack.subtitleDe : stack.subtitleEn}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={index === 0 || busyAction}
                              onClick={() => handleMoveStackOrder(index, -1)}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center disabled:opacity-35 cursor-pointer hover:bg-[var(--elevated)]"
                              style={{
                                borderColor: 'var(--border)',
                                backgroundColor: 'var(--subtle)',
                                color: 'var(--ink-muted)',
                              }}
                              title={isDe ? 'Nach oben' : 'Move up'}
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={index === filteredStacks.length - 1 || busyAction}
                              onClick={() => handleMoveStackOrder(index, 1)}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center disabled:opacity-35 cursor-pointer hover:bg-[var(--elevated)]"
                              style={{
                                borderColor: 'var(--border)',
                                backgroundColor: 'var(--subtle)',
                                color: 'var(--ink-muted)',
                              }}
                              title={isDe ? 'Nach unten' : 'Move down'}
                            >
                              <ArrowDown size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStack({ isNew: false, stack: { ...stack } })}
                              className="px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                              style={{
                                borderColor: 'var(--border)',
                                backgroundColor: 'var(--subtle)',
                                color: 'var(--ink)',
                              }}
                            >
                              {isDe ? 'Bearbeiten' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleArchiveStackToggle(stack)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              {stack.archived
                                ? isDe
                                  ? 'Aktivieren'
                                  : 'Restore'
                                : isDe
                                  ? 'Archiv'
                                  : 'Archive'}
                            </button>
                            <button
                              type="button"
                              disabled={adminStacks.length <= 1 || busyAction}
                              onClick={() => openDeleteStackModal(stack)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-35"
                              style={{ color: 'var(--danger)' }}
                            >
                              {isDe ? 'Entfernen' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* SECTION 3: FRIEND REVIEW (Prüfung Pattern) */}
          {tab === 'review' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight m-0">
                    {isDe ? 'Prüfung' : 'Friend Review'}
                  </h1>
                  <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                    {isDe
                      ? 'Bewertungen und Textvorschläge von Freunden prüfen und Top-Karten direkt im Katalog freischalten.'
                      : 'Review friend ratings and wording edits, then promote top picks directly into the live catalog.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyReviewUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--card)',
                      color: 'var(--ink)',
                    }}
                  >
                    {copiedReviewLink ? <Check size={13} /> : <Copy size={13} />}
                    <span>
                      {copiedReviewLink
                        ? isDe
                          ? 'Link kopiert!'
                          : 'Copied!'
                        : isDe
                          ? 'Review-Link'
                          : 'Copy /review'}
                    </span>
                  </button>

                  {reviewSubTab === 'suggestion' && (
                    <button
                      type="button"
                      disabled={selectedVisibleReviewIds.length === 0 || busyAction}
                      onClick={() => handlePromoteReviewIds(selectedVisibleReviewIds)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-45"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      <Plus size={14} />
                      <span>
                        {isDe
                          ? `${selectedVisibleReviewIds.length} übernehmen`
                          : `Add ${selectedVisibleReviewIds.length} Selected`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Compact KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div
                  className="rounded-xl border p-3.5 space-y-0.5"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Teilnehmende Freunde' : 'Friends Reviewed'}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {reviewSummary?.reviewerCount ?? 0}
                  </div>
                </div>

                <div
                  className="rounded-xl border p-3.5 space-y-0.5"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Bewertete Vorschläge' : 'Rated Suggestions'}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {reviewOverview.ratedSuggestions}{' '}
                    <span className="text-xs font-normal" style={{ color: 'var(--ink-muted)' }}>
                      / {reviewOverview.totalSuggestions}
                    </span>
                  </div>
                </div>

                <div
                  className="rounded-xl border p-3.5 space-y-0.5"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--gold-hairline)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--gold)' }}>
                    {isDe ? 'Empfohlen (1/3 – 2/3)' : 'Recommended (1/3 – 2/3)'}
                  </div>
                  <div
                    className="text-xl font-semibold tabular-nums"
                    style={{ color: 'var(--gold)' }}
                  >
                    {recommendedReviewIds.size}
                  </div>
                </div>

                <div
                  className="rounded-xl border p-3.5 space-y-0.5"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Offene Textvorschläge' : 'Pending Wording Edits'}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {reviewOverview.pendingEdits}
                  </div>
                </div>
              </div>

              {/* Underline Sub-Tabs */}
              <div
                className="flex items-center gap-5 border-b overflow-x-auto no-scrollbar"
                style={{ borderColor: 'var(--border)' }}
              >
                {(
                  [
                    [
                      'suggestion',
                      isDe ? 'Neue Vorschläge' : 'New Suggestions',
                      reviewOverview.totalSuggestions,
                    ],
                    ['live', isDe ? 'Live-Karten' : 'Live Cards', reviewOverview.totalLive],
                    [
                      'edits',
                      isDe ? 'Textvorschläge' : 'Wording Edits',
                      reviewOverview.pendingEdits,
                    ],
                  ] as [ReviewSubTab, string, number][]
                ).map(([key, label, count]) => {
                  const active = reviewSubTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setReviewSubTab(key)}
                      className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                      style={{ color: active ? 'var(--ink)' : 'var(--ink-muted)' }}
                    >
                      <span>{label}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
                        style={{
                          backgroundColor: active ? 'var(--ink)' : 'var(--elevated)',
                          color: active ? 'var(--bg)' : 'var(--ink-muted)',
                        }}
                      >
                        {count}
                      </span>
                      {active && (
                        <span
                          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Unified Bordered Container */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {/* Filter & Preset Toolbar */}
                <div
                  className="p-3 border-b flex flex-wrap items-center justify-between gap-2.5"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
                >
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--ink-soft)' }}
                      />
                      <input
                        type="search"
                        value={reviewSearch}
                        onChange={(e) => setReviewSearch(e.target.value)}
                        placeholder={isDe ? 'Einträge durchsuchen…' : 'Search review items…'}
                        className="w-full h-9 rounded-lg pl-9 pr-3 text-xs"
                        style={{
                          backgroundColor: 'var(--card)',
                          color: 'var(--ink)',
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>

                    <select
                      value={reviewCategory}
                      onChange={(e) => setReviewCategory(e.target.value)}
                      aria-label="Filter review category"
                      className="h-9 rounded-lg px-3 text-xs"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <option value="all">{isDe ? 'Alle Kategorien' : 'All categories'}</option>
                      {adminStacks.map((s) => (
                        <option key={s.id} value={s.id}>
                          {isDe ? s.nameDe : s.nameEn}
                        </option>
                      ))}
                      <option value="__wildcards__">
                        {isDe ? 'Impulse / Wildcards' : 'Moments / Wildcards'}
                      </option>
                    </select>
                  </div>

                  {reviewSubTab === 'suggestion' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="inline-flex p-0.5 rounded-lg border text-[11px]"
                        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                      >
                        {(
                          [
                            ['auto', 'Auto'],
                            ['top33', '33%'],
                            ['top50', '50%'],
                            ['top67', '67%'],
                          ] as [RecommendationPreset, string][]
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setReviewPreset(key)}
                            className="px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors"
                            style={{
                              backgroundColor:
                                reviewPreset === key ? 'var(--gold-soft)' : 'transparent',
                              color: reviewPreset === key ? 'var(--gold)' : 'var(--ink-muted)',
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedReviewIds(new Set(recommendedReviewIds))}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[var(--elevated)]"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {isDe ? 'Auswahl zurücksetzen' : 'Reset'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Review Rows */}
                {reviewLoading && !reviewSummary ? (
                  <div className="py-12 px-4 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Lade Freunde-Bewertungen…' : 'Loading friend review summary…'}
                  </div>
                ) : reviewSubTab === 'edits' ? (
                  visiblePendingEdits.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-1">
                      <div className="text-sm font-medium">
                        {isDe ? 'Keine offenen Textvorschläge' : 'No pending wording edits'}
                      </div>
                      <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                        {isDe
                          ? 'Neue Formulierungsvorschläge aus /review erscheinen automatisch hier.'
                          : 'Wording edits submitted from /review will appear here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {visiblePendingEdits.map(({ stat, edit }) => {
                        const originalText = edit.language === 'de' ? stat.card.de : stat.card.en;
                        const openEditFromWordingRow = () => {
                          const prefilled: CardItem = {
                            ...stat.card,
                            [edit.language]: edit.suggestedText,
                          };
                          const pending = stat.edits.filter((e) => !e.dismissed);
                          if (stat.source === 'suggestion' && !stat.promoted) {
                            setEditingSuggestion({
                              card: prefilled,
                              pendingEdits: pending,
                              dismissEditId: edit.id,
                            });
                          } else {
                            openCardEditor(prefilled, pending, edit.id);
                          }
                        };

                        return (
                          <div
                            key={edit.id}
                            onClick={openEditFromWordingRow}
                            className="p-4 space-y-2 cursor-pointer hover:bg-[var(--subtle)] transition-colors"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span style={{ color: 'var(--ink-muted)' }}>
                                <span className="font-mono">{stat.cardId}</span> ·{' '}
                                {edit.language.toUpperCase()} · {edit.reviewerName || 'Friend'}
                              </span>
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={openEditFromWordingRow}
                                  className="px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:bg-[var(--elevated)]"
                                  style={{
                                    borderColor: 'var(--border)',
                                    backgroundColor: 'var(--subtle)',
                                    color: 'var(--ink)',
                                  }}
                                >
                                  {isDe ? 'Bearbeiten' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() =>
                                    handleApplySuggestedEdit(
                                      stat.cardId,
                                      edit.language,
                                      edit.suggestedText,
                                      edit.id,
                                    )
                                  }
                                  className="px-3 py-1 rounded-lg text-[11px] font-medium cursor-pointer"
                                  style={{
                                    backgroundColor: 'var(--accent)',
                                    color: 'var(--accent-ink)',
                                  }}
                                >
                                  {stat.source === 'live'
                                    ? isDe
                                      ? 'Live-Text ersetzen'
                                      : 'Apply to Live Card'
                                    : isDe
                                      ? 'Mit Text übernehmen'
                                      : 'Use & Add to Live'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => handleDismissSuggestedEdit(edit.id)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] cursor-pointer hover:bg-[var(--elevated)]"
                                  style={{ color: 'var(--ink-muted)' }}
                                >
                                  {isDe ? 'Verwerfen' : 'Dismiss'}
                                </button>
                              </div>
                            </div>
                            <div
                              className="text-xs line-through opacity-70"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              {originalText}
                            </div>
                            <div className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                              {edit.suggestedText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : filteredReviewStats.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-1">
                    <div className="text-sm font-medium">
                      {isDe ? 'Keine Einträge in dieser Ansicht' : 'No items in this view'}
                    </div>
                    <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe
                        ? 'Passe Kategorie oder Suchbegriff an.'
                        : 'Adjust category or search filters to view cards.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {visibleReviewStats.map((stat) => {
                      const stackMeta = getStackMetaSafe(stackMap, stat.card.stackId);
                      const isRec = recommendedReviewIds.has(stat.cardId);
                      const isSelected = selectedReviewIds.has(stat.cardId);
                      const isEditedDraft =
                        reviewSubTab === 'suggestion' &&
                        !stat.promoted &&
                        Boolean(reviewSummary?.editedSuggestionIds?.includes(stat.cardId));
                      const scoreLabel =
                        stat.weightedScore > 0
                          ? `+${stat.weightedScore}`
                          : String(stat.weightedScore);

                      const openReviewItemEditor = () => {
                        const pending = stat.edits.filter((e) => !e.dismissed);
                        if (stat.source === 'suggestion' && !stat.promoted) {
                          setEditingSuggestion({
                            card: { ...stat.card },
                            pendingEdits: pending,
                          });
                        } else {
                          openCardEditor(stat.card, pending);
                        }
                      };

                      return (
                        <div
                          key={stat.cardId}
                          onClick={openReviewItemEditor}
                          className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer hover:bg-[var(--subtle)] transition-colors"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {reviewSubTab === 'suggestion' && !stat.promoted && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => handleToggleSelectReviewCard(stat.cardId)}
                                aria-label={`Select ${stat.cardId}`}
                                className="mt-1 shrink-0 cursor-pointer"
                              />
                            )}
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                {reviewSubTab === 'suggestion' && stat.promoted && (
                                  <span
                                    className="px-2 py-0.5 rounded-full font-medium"
                                    style={{
                                      backgroundColor: 'var(--accent-soft)',
                                      color: 'var(--accent)',
                                    }}
                                  >
                                    {isDe ? 'Auf Website live' : 'Already Live'}
                                  </span>
                                )}
                                {reviewSubTab === 'suggestion' && !stat.promoted && isRec && (
                                  <span
                                    className="px-2 py-0.5 rounded-full font-medium"
                                    style={{
                                      backgroundColor: 'var(--gold-soft)',
                                      color: 'var(--gold)',
                                    }}
                                  >
                                    {isDe ? 'Top-Auswahl' : 'Recommended'}
                                  </span>
                                )}
                                {isEditedDraft && (
                                  <span
                                    className="px-2 py-0.5 rounded-full font-medium"
                                    style={{
                                      backgroundColor: 'var(--elevated)',
                                      color: 'var(--ink)',
                                      border: '1px solid var(--border-strong)',
                                    }}
                                  >
                                    {isDe ? 'Entwurf bearbeitet' : 'Edited'}
                                  </span>
                                )}
                                <span
                                  className="px-2 py-0.5 rounded-md border"
                                  style={{
                                    backgroundColor: 'var(--subtle)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--ink-muted)',
                                  }}
                                >
                                  {stat.card.kind === 'wildcard'
                                    ? isDe
                                      ? 'Impuls / Wildcard'
                                      : 'Wildcard'
                                    : isDe
                                      ? stackMeta.nameDe
                                      : stackMeta.nameEn}
                                </span>
                                {stat.card.author && (
                                  <span className="font-medium" style={{ color: 'var(--ink)' }}>
                                    {stat.card.author}
                                  </span>
                                )}
                                <span className="font-mono" style={{ color: 'var(--ink-soft)' }}>
                                  {stat.cardId}
                                </span>
                              </div>

                              <p className="text-sm m-0" style={{ color: 'var(--ink)' }}>
                                {isDe ? stat.card.de : stat.card.en}
                              </p>
                              <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                                {isDe ? stat.card.en : stat.card.de}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {stat.voteCount > 0 ? (
                              <div className="flex flex-col sm:items-end gap-0.5">
                                <span
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
                                  style={{
                                    backgroundColor:
                                      stat.weightedScore > 0
                                        ? 'var(--accent-soft)'
                                        : stat.weightedScore < 0
                                          ? 'var(--danger-soft)'
                                          : 'var(--subtle)',
                                    color:
                                      stat.weightedScore > 0
                                        ? 'var(--accent)'
                                        : stat.weightedScore < 0
                                          ? 'var(--danger)'
                                          : 'var(--ink-muted)',
                                  }}
                                >
                                  {scoreLabel} · avg {stat.averageScore >= 0 ? '+' : ''}
                                  {stat.averageScore.toFixed(1)} ({stat.voteCount})
                                </span>
                                <span
                                  className="text-[10px] tabular-nums"
                                  style={{ color: 'var(--ink-muted)' }}
                                >
                                  ++ {stat.up2} · + {stat.up1} · - {stat.down1} · -- {stat.down2}
                                </span>
                              </div>
                            ) : (
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[11px]"
                                style={{
                                  backgroundColor: 'var(--subtle)',
                                  color: 'var(--ink-soft)',
                                }}
                              >
                                {isDe ? 'Keine Stimmen' : 'Unrated'}
                              </span>
                            )}

                            {reviewSubTab === 'suggestion' && !stat.promoted && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={openReviewItemEditor}
                                  className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--elevated)]"
                                  style={{
                                    backgroundColor: 'var(--subtle)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--ink)',
                                  }}
                                >
                                  {isDe ? 'Bearbeiten' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => handlePromoteReviewIds([stat.cardId])}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                                  style={{
                                    backgroundColor: 'var(--accent)',
                                    color: 'var(--accent-ink)',
                                  }}
                                >
                                  {isDe ? '+ Aufnehmen' : '+ Add to Live'}
                                </button>
                              </>
                            )}

                            {reviewSubTab === 'suggestion' && stat.promoted && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={openReviewItemEditor}
                                className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--elevated)]"
                                style={{
                                  backgroundColor: 'var(--subtle)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--ink)',
                                }}
                              >
                                {isDe ? 'Bearbeiten' : 'Edit'}
                              </button>
                            )}

                            {reviewSubTab === 'live' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={openReviewItemEditor}
                                  className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-50 hover:bg-[var(--elevated)]"
                                  style={{
                                    backgroundColor: 'var(--subtle)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--ink)',
                                  }}
                                >
                                  {isDe ? 'Bearbeiten' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => handleArchiveToggle(stat.card)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                                  style={{ color: 'var(--ink-muted)' }}
                                >
                                  {stat.card.archived
                                    ? isDe
                                      ? 'Aktivieren'
                                      : 'Restore'
                                    : isDe
                                      ? 'Archivieren'
                                      : 'Archive'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>

                    {filteredReviewStats.length > visibleReviewStats.length && (
                      <div
                        className="px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
                      >
                        <span style={{ color: 'var(--ink-muted)' }}>
                          {isDe
                            ? `Zeige ${visibleReviewStats.length} von ${filteredReviewStats.length} Einträgen`
                            : `Showing ${visibleReviewStats.length} of ${filteredReviewStats.length} items`}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setReviewVisibleCount((c) => c + 50)}
                            className="px-3 py-1.5 rounded-lg border font-medium cursor-pointer hover:bg-[var(--elevated)]"
                            style={{
                              borderColor: 'var(--border)',
                              backgroundColor: 'var(--card)',
                              color: 'var(--ink)',
                            }}
                          >
                            {isDe ? '50 mehr laden' : 'Load 50 more'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewVisibleCount(filteredReviewStats.length)}
                            className="px-3 py-1.5 rounded-lg font-medium cursor-pointer hover:bg-[var(--elevated)]"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            {isDe ? 'Alle anzeigen' : 'Show all'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* SECTION 4: GROUP INBOX */}
          {tab === 'inbox' && (
            <section className="space-y-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight m-0">
                  {isDe ? 'Runden-Eingang' : 'Group Inbox'}
                </h1>
                <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                  {isDe
                    ? 'Eingeworfene Gästefragen aus QR-Runden prüfen und dauerhaft in Stapel aufnehmen.'
                    : 'Review guest questions submitted via QR group rooms and promote favorites to permanent stacks.'}
                </p>
              </div>

              <div
                className="flex items-center gap-5 border-b overflow-x-auto no-scrollbar"
                style={{ borderColor: 'var(--border)' }}
              >
                {(
                  [
                    ['pending', isDe ? 'Offen' : 'Pending', inboxCounts.pending],
                    ['promoted', isDe ? 'Übernommen' : 'Promoted', inboxCounts.promoted],
                    ['dismissed', isDe ? 'Verworfen' : 'Dismissed', inboxCounts.dismissed],
                  ] as [InboxStatusTab, string, number][]
                ).map(([key, label, count]) => {
                  const active = inboxStatusTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInboxStatusTab(key)}
                      className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                      style={{ color: active ? 'var(--ink)' : 'var(--ink-muted)' }}
                    >
                      <span>{label}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
                        style={{
                          backgroundColor: active ? 'var(--ink)' : 'var(--elevated)',
                          color: active ? 'var(--bg)' : 'var(--ink-muted)',
                        }}
                      >
                        {count}
                      </span>
                      {active && (
                        <span
                          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <div
                  className="p-3 border-b"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--subtle)' }}
                >
                  <div className="relative max-w-md">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--ink-soft)' }}
                    />
                    <input
                      type="search"
                      value={inboxSearch}
                      onChange={(e) => setInboxSearch(e.target.value)}
                      placeholder={
                        isDe ? 'Einreichungen durchsuchen…' : 'Search room code, author, or text…'
                      }
                      className="w-full h-9 rounded-lg pl-9 pr-3 text-xs"
                      style={{
                        backgroundColor: 'var(--card)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                </div>

                {filteredInbox.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-1">
                    <div className="text-sm font-medium">
                      {isDe ? 'Keine Einträge in dieser Ansicht' : 'No submissions in this view'}
                    </div>
                    <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe
                        ? 'Neue Gästefragen aus QR-Runden erscheinen automatisch hier.'
                        : 'Guest questions submitted from QR rooms appear here automatically.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {filteredInbox.map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => setEditingSubmission(sub)}
                        className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[var(--subtle)] transition-colors"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                            <span className="font-mono">Room {sub.roomCode}</span> ·{' '}
                            {sub.language.toUpperCase()} · {sub.authorName || 'Anonymous'}
                          </div>
                          <p className="text-sm m-0">{sub.text}</p>
                        </div>

                        <div
                          className="flex flex-wrap items-center gap-2 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => setEditingSubmission(sub)}
                            className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                            style={{
                              borderColor: 'var(--border)',
                              backgroundColor: 'var(--subtle)',
                              color: 'var(--ink)',
                            }}
                          >
                            {isDe ? 'Bearbeiten' : 'Edit'}
                          </button>

                          {sub.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingSubmission(sub)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-ink)',
                                }}
                              >
                                {isDe ? 'In Stapel übernehmen' : 'Promote to deck'}
                              </button>
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => handleDismissSubmission(sub.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {isDe ? 'Verwerfen' : 'Dismiss'}
                              </button>
                            </>
                          ) : (
                            <span
                              className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                              style={{
                                backgroundColor:
                                  sub.status === 'promoted'
                                    ? 'var(--accent-soft)'
                                    : 'var(--elevated)',
                                color:
                                  sub.status === 'promoted'
                                    ? 'var(--accent)'
                                    : 'var(--ink-muted)',
                              }}
                            >
                              {sub.status === 'promoted'
                                ? isDe
                                  ? 'Übernommen'
                                  : 'Promoted'
                                : isDe
                                  ? 'Verworfen'
                                  : 'Dismissed'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* SECTION 5: INSIGHTS */}
          {tab === 'insights' && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight m-0">
                    {isDe ? 'Auswertung' : 'Insights'}
                  </h1>
                  <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                    {isDe
                      ? 'Zustimmung pro Stapel und Live-Bewertungen aus Gesprächsrunden.'
                      : 'Approval rates across stacks and live card ratings from play sessions.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="px-3.5 py-2 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--ink)',
                  }}
                >
                  {isDe ? 'Bewertungen CSV' : 'Export Ratings CSV'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stackRatingTotals.map(({ stack, up, down, pct }) => (
                  <div
                    key={stack.id}
                    className="rounded-xl border p-4 space-y-1"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stack.accent }}
                      />
                      <span className="truncate">{isDe ? stack.nameDe : stack.nameEn}</span>
                    </div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {pct === null ? '—' : `${pct}%`}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      +{up} / -{down}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="flex items-center gap-5 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setInsightsSubTab('best')}
                  className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium cursor-pointer"
                  style={{ color: insightsSubTab === 'best' ? 'var(--ink)' : 'var(--ink-muted)' }}
                >
                  <ThumbUpIcon size={13} />
                  <span>{isDe ? 'Beliebteste Karten' : 'Top Resonating Cards'}</span>
                  {insightsSubTab === 'best' && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setInsightsSubTab('worst')}
                  className="relative py-2.5 inline-flex items-center gap-2 text-xs font-medium cursor-pointer"
                  style={{ color: insightsSubTab === 'worst' ? 'var(--ink)' : 'var(--ink-muted)' }}
                >
                  <ThumbDownIcon size={13} />
                  <span>{isDe ? 'Kandidaten zum Überarbeiten' : 'Lowest Rated'}</span>
                  {insightsSubTab === 'worst' && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </button>
              </div>

              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {(insightsSubTab === 'best' ? sortedByRating.best : sortedByRating.worst).length ===
                0 ? (
                  <div className="py-12 px-4 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Noch keine Bewertungen vorhanden.' : 'No card ratings recorded yet.'}
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {(insightsSubTab === 'best' ? sortedByRating.best : sortedByRating.worst)
                      .slice(0, 20)
                      .map(({ card, score }) => {
                        const stack = getStackMetaSafe(stackMap, card.stackId);
                        return (
                          <div
                            key={card.id}
                            className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--subtle)] transition-colors"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-sm truncate">{isDe ? card.de : card.en}</div>
                              <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                                {isDe ? stack.nameDe : stack.nameEn} · {card.id}
                              </div>
                            </div>
                            <span
                              className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium tabular-nums"
                              style={{
                                backgroundColor:
                                  insightsSubTab === 'best'
                                    ? 'var(--accent-soft)'
                                    : 'var(--subtle)',
                                color:
                                  insightsSubTab === 'best'
                                    ? 'var(--accent)'
                                    : 'var(--ink-muted)',
                              }}
                            >
                              +{score.up} / -{score.down}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* SECTION 6: SETTINGS & SYNC (Betrieb & Sync) */}
          {tab === 'security' && (
            <section className="space-y-5">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight m-0">
                  {isDe ? 'Betrieb & Sync' : 'Settings & Sync'}
                </h1>
                <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                  {isDe
                    ? 'Speicherstatus, Basisdaten-Wiederherstellung, JSON-Export und Zugangsverwaltung.'
                    : 'Backend storage status, baseline card restoration, JSON backup, and account security.'}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div
                  className="rounded-2xl border p-5 space-y-4"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold m-0">
                      {isDe ? 'Speicher & Datensicherung' : 'Storage & Backup'}
                    </h2>
                    <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
                      {authStatus.mode === 'vercel'
                        ? isDe
                          ? `Verbunden mit Vercel Private Blob (${authStatus.email || 'Admin'}). Alle Änderungen werden sofort live gespeichert.`
                          : `Connected to Vercel Private Blob (${authStatus.email || 'Admin'}). Every stack edit, card change, rating, and QR room persists live.`
                        : isDe
                          ? 'Aktuell läuft eine lokale Vorschau ohne Server-API. Änderungen bleiben in diesem Browser gespeichert.'
                          : 'Running in browser-local preview mode. Deploy on Vercel with Private Blob for synced edits and server-verified login.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={handleReseedMissing}
                      className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      {isDe
                        ? `Standardkarten ergänzen (${SEED_CARDS.length})`
                        : `Restore Baseline Cards (${SEED_CARDS.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={exportJson}
                      className="px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer hover:bg-[var(--elevated)]"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                      }}
                    >
                      {isDe ? 'Katalog als JSON laden' : 'Export Full Catalog JSON'}
                    </button>
                  </div>
                </div>

                {authStatus.mode === 'vercel' && (
                  <form
                    onSubmit={handleChangePassword}
                    className="rounded-2xl border p-5 space-y-3"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    <h2 className="text-base font-semibold m-0">
                      {isDe ? 'Admin-Passwort ändern' : 'Change Admin Password'}
                    </h2>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={isDe ? 'Aktuelles Passwort' : 'Current password'}
                      className="w-full h-9 rounded-lg px-3 text-xs"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={
                        isDe ? 'Neues Passwort (mind. 8 Zeichen)' : 'New password (min. 8 chars)'
                      }
                      className="w-full h-9 rounded-lg px-3 text-xs"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder={isDe ? 'Neues Passwort bestätigen' : 'Confirm new password'}
                      className="w-full h-9 rounded-lg px-3 text-xs"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={busyAction}
                      className="px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-60 hover:bg-[var(--elevated)]"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                      }}
                    >
                      {isDe ? 'Passwort speichern' : 'Update Password'}
                    </button>
                  </form>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* MODAL: Edit / Create Card */}
      {editingCard && (
        <CardEditorModal
          key={editingCard.card.id}
          card={editingCard.card}
          pendingEdits={editingCard.pendingEdits}
          initialDismissEditId={editingCard.dismissEditId}
          stacks={adminStacks}
          isDe={isDe}
          busy={busyAction}
          onSave={handleSaveCard}
          onClose={() => setEditingCard(null)}
        />
      )}

      {/* MODAL: Edit Suggestion Before Publishing */}
      {editingSuggestion && (
        <SuggestionEditorModal
          key={editingSuggestion.card.id}
          card={editingSuggestion.card}
          pendingEdits={editingSuggestion.pendingEdits}
          initialDismissEditId={editingSuggestion.dismissEditId}
          stacks={adminStacks}
          isDe={isDe}
          busy={busyAction}
          onSaveDraft={handleSaveSuggestionDraft}
          onPublish={handlePublishEditedSuggestion}
          onClose={() => setEditingSuggestion(null)}
        />
      )}

      {/* MODAL: Create / Edit Stack */}
      {editingStack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setEditingStack(null)}
        >
          <form
            onSubmit={handleSaveStack}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {editingStack.isNew
                ? isDe
                  ? 'Neuen Stapel anlegen'
                  : 'Create New Stack'
                : isDe
                  ? 'Stapel bearbeiten'
                  : 'Edit Stack'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block space-y-1">
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  Name (EN)
                </span>
                <input
                  type="text"
                  required
                  value={editingStack.stack.nameEn}
                  onChange={(e) => {
                    const nextNameEn = e.target.value;
                    setEditingStack((prev) => {
                      if (!prev) return prev;
                      const autoSlug =
                        prev.isNew &&
                        (!prev.stack.id || prev.stack.id === slugifyStackId(prev.stack.nameEn))
                          ? slugifyStackId(nextNameEn)
                          : prev.stack.id;
                      return {
                        ...prev,
                        stack: { ...prev.stack, nameEn: nextNameEn, id: autoSlug },
                      };
                    });
                  }}
                  placeholder="Evening Rituals"
                  className="w-full rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  Name (DE)
                </span>
                <input
                  type="text"
                  required
                  value={editingStack.stack.nameDe}
                  onChange={(e) =>
                    setEditingStack({
                      ...editingStack,
                      stack: { ...editingStack.stack, nameDe: e.target.value },
                    })
                  }
                  placeholder="Abend-Rituale"
                  className="w-full rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {isDe ? 'Stapel-ID (Kleinbuchstaben, Zahlen, -)' : 'Stack Slug ID (a-z, 0-9, -)'}
              </span>
              <input
                type="text"
                required
                readOnly={!editingStack.isNew}
                pattern="[a-z0-9][a-z0-9-]{1,39}"
                value={editingStack.stack.id}
                onChange={(e) =>
                  setEditingStack({
                    ...editingStack,
                    stack: { ...editingStack.stack, id: e.target.value.toLowerCase() },
                  })
                }
                placeholder="evening-rituals"
                className="w-full rounded-lg px-3 py-2 text-xs read-only:opacity-60"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>

            <label className="block space-y-1">
              <div
                className="flex justify-between text-[11px]"
                style={{ color: 'var(--ink-muted)' }}
              >
                <span>{isDe ? 'Unterzeile DE (max. 1 Zeile)' : 'Subtitle DE (1 line max)'}</span>
                <span>{editingStack.stack.subtitleDe.length}/55</span>
              </div>
              <input
                type="text"
                maxLength={100}
                value={editingStack.stack.subtitleDe}
                onChange={(e) =>
                  setEditingStack({
                    ...editingStack,
                    stack: { ...editingStack.stack, subtitleDe: e.target.value },
                  })
                }
                placeholder="Sanfte Fragen zum Ausklang"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>

            <label className="block space-y-1">
              <div
                className="flex justify-between text-[11px]"
                style={{ color: 'var(--ink-muted)' }}
              >
                <span>{isDe ? 'Unterzeile EN (max. 1 Zeile)' : 'Subtitle EN (1 line max)'}</span>
                <span>{editingStack.stack.subtitleEn.length}/55</span>
              </div>
              <input
                type="text"
                maxLength={100}
                value={editingStack.stack.subtitleEn}
                onChange={(e) =>
                  setEditingStack({
                    ...editingStack,
                    stack: { ...editingStack.stack, subtitleEn: e.target.value },
                  })
                }
                placeholder="Gentle prompts to close the evening"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-[11px] block" style={{ color: 'var(--ink-muted)' }}>
                {isDe ? 'Emblem wählen' : 'Artwork Emblem'}
              </span>
              <div className="grid grid-cols-6 gap-2">
                {STACK_ICON_IDS.map((icon) => {
                  const active = (editingStack.stack.iconId ?? 'reflection') === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() =>
                        setEditingStack({
                          ...editingStack,
                          stack: { ...editingStack.stack, iconId: icon as StackIconId },
                        })
                      }
                      aria-label={`Select ${icon} icon`}
                      className="h-12 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--subtle)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        color: active ? 'var(--gold)' : 'var(--ink-muted)',
                      }}
                    >
                      <StackArtwork stackId={icon} iconId={icon} size={24} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStack(null)}
                className="px-4 py-2 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Speichern' : 'Save Stack'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Delete Stack & Reassign Cards */}
      {deletingStack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setDeletingStack(null)}
        >
          <form
            onSubmit={handleConfirmDeleteStack}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border p-6 space-y-4"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe
                ? `Stapel „${deletingStack.stack.nameDe}“ entfernen?`
                : `Remove stack "${deletingStack.stack.nameEn}"?`}
            </h2>

            {deletingStack.cardCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
                  {isDe
                    ? `Dieser Stapel enthält noch ${deletingStack.cardCount} Karten. Wähle den Ziel-Stapel, in den alle Karten verschoben werden:`
                    : `This stack contains ${deletingStack.cardCount} cards. Choose a destination stack to move them into before deleting:`}
                </p>
                <select
                  value={deletingStack.reassignTo}
                  onChange={(e) =>
                    setDeletingStack({ ...deletingStack, reassignTo: e.target.value })
                  }
                  className="w-full rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {adminStacks
                    .filter((s) => s.id !== deletingStack.stack.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {isDe ? s.nameDe : s.nameEn}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                {isDe
                  ? 'Dieser Stapel enthält keine Karten und kann direkt entfernt werden.'
                  : 'This stack has no cards and can be removed directly.'}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingStack(null)}
                className="px-4 py-2 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {isDe ? 'Endgültig entfernen' : 'Delete Stack'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Edit / Promote Group Submission */}
      {editingSubmission && (
        <InboxSubmissionModal
          key={editingSubmission.id}
          submission={editingSubmission}
          stacks={adminStacks}
          isDe={isDe}
          busy={busyAction}
          onSaveDraft={handleSaveInboxDraft}
          onPromote={handlePromoteInboxSubmission}
          onClose={() => setEditingSubmission(null)}
        />
      )}
    </div>
  );
};
