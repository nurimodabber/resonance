import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeftIcon,
  StackArtwork,
  ThumbDownIcon,
  ThumbUpIcon,
} from '../components/Icons';
import { useResonance } from '../context/ResonanceContext';
import { buildStackMap, getStackMetaSafe, STACK_ICON_IDS } from '../data/stacks';
import {
  archiveCard,
  archiveStack,
  changeAdminPassword,
  deleteCard,
  deleteStack,
  fetchAdminAuthStatus,
  fetchAdminInsights,
  loginAdmin,
  logoutAdmin,
  moveCardStack,
  reorderStacks,
  reseedMissingCards,
  SEED_CARDS,
  setupAdmin,
  summarizeRatings,
  updateSubmissionStatus,
  upsertCard,
  upsertStack,
  type AdminAuthStatus,
} from '../services/repository';
import type {
  CardItem,
  CardKind,
  CardRating,
  GroupSubmission,
  QuoteSubdeck,
  RuhiChapter,
  StackIconId,
  StackId,
  StackMeta,
} from '../types/deck';

type AdminTab = 'cards' | 'stacks' | 'insights' | 'inbox' | 'security';

function slugifyStackId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

export const AdminPage: React.FC = () => {
  const { lang, stacks: publicStacks, cards: publicCards, refreshCatalog, navigate } =
    useResonance();
  const isDe = lang === 'de';

  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [claimEmail, setClaimEmail] = useState('milan.modabber@gmail.com');
  const [loginEmail, setLoginEmail] = useState('milan.modabber@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [tab, setTab] = useState<AdminTab>('cards');
  const [adminStacks, setAdminStacks] = useState<StackMeta[]>(publicStacks);
  const [adminCards, setAdminCards] = useState<CardItem[]>(publicCards);
  const [ratings, setRatings] = useState<CardRating[]>([]);
  const [submissions, setSubmissions] = useState<GroupSubmission[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  // Cards tab filters & state
  const [search, setSearch] = useState('');
  const [stackFilter, setStackFilter] = useState<StackId | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<CardKind | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);

  // Stacks tab modals
  const [editingStack, setEditingStack] = useState<{
    isNew: boolean;
    stack: StackMeta;
  } | null>(null);
  const [deletingStack, setDeletingStack] = useState<{
    stack: StackMeta;
    cardCount: number;
    reassignTo: StackId;
  } | null>(null);

  // Inbox promote modal
  const [promoting, setPromoting] = useState<{
    sub: GroupSubmission;
    stackId: StackId;
    de: string;
    en: string;
  } | null>(null);

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const stackMap = useMemo(() => buildStackMap(adminStacks), [adminStacks]);
  const ratingSummary = useMemo(() => summarizeRatings(ratings), [ratings]);

  const loadAdminData = useCallback(async () => {
    try {
      const data = await fetchAdminInsights();
      setAdminStacks(data.stacks);
      setAdminCards(data.cards);
      setRatings(data.ratings);
      setSubmissions(data.submissions);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to load admin data');
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
      loadAdminData();
    }
  }, [authStatus?.authenticated, loadAdminData]);

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

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adminCards.filter((c) => {
      if (!showArchived && c.archived) return false;
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
  }, [adminCards, showArchived, stackFilter, kindFilter, search]);

  const sortedByRating = useMemo(() => {
    const withScores = adminCards
      .filter((c) => ratingSummary[c.id]?.total > 0)
      .map((c) => ({ card: c, score: ratingSummary[c.id] }));
    const best = [...withScores].sort((a, b) => b.score.net - a.score.net || b.score.up - a.score.up);
    const worst = [...withScores].sort((a, b) => a.score.net - b.score.net || b.score.down - a.score.down);
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

  const pendingInbox = useMemo(
    () => submissions.filter((s) => s.status === 'pending'),
    [submissions],
  );

  const notifyOk = (msg: string) => {
    setErrorBanner('');
    setStatusBanner(msg);
  };

  const notifyErr = (err: unknown) => {
    setStatusBanner('');
    setErrorBanner(err instanceof Error ? err.message : 'Action failed.');
  };

  // ---------- Auth Handlers ----------

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (password.length < 8) {
      setAuthError(
        isDe ? 'Passwort muss mindestens 8 Zeichen lang sein.' : 'Password must be at least 8 characters.',
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
      await Promise.all([loadAdminData(), refreshCatalog()]);
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
      await loadAdminData();
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
      notifyErr(new Error(isDe ? 'Neue Passwörter stimmen nicht überein.' : 'New passwords do not match.'));
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

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard || busyAction) return;
    setBusyAction(true);
    try {
      await upsertCard(editingCard);
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setEditingCard(null);
      notifyOk(isDe ? 'Karte gespeichert.' : 'Card saved.');
    } catch (err) {
      notifyErr(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleMoveCardStack = async (card: CardItem, nextStackId: StackId) => {
    if (card.stackId === nextStackId || busyAction) return;
    setBusyAction(true);
    try {
      await moveCardStack(card.id, nextStackId);
      const targetName = stackMap[nextStackId]?.nameEn ?? nextStackId;
      await Promise.all([loadAdminData(), refreshCatalog()]);
      notifyOk(
        isDe
          ? `Karte ${card.id} nach „${stackMap[nextStackId]?.nameDe ?? nextStackId}“ verschoben.`
          : `Moved card ${card.id} to "${targetName}".`,
      );
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
      await archiveCard(card.id, !card.archived);
      await Promise.all([loadAdminData(), refreshCatalog()]);
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
      await Promise.all([loadAdminData(), refreshCatalog()]);
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
      await Promise.all([loadAdminData(), refreshCatalog()]);
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
    if (target < 0 || target >= adminStacks.length || busyAction) return;
    const copy = adminStacks.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    setBusyAction(true);
    try {
      const next = await reorderStacks(copy.map((s) => s.id));
      setAdminStacks(next);
      await refreshCatalog();
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
      await Promise.all([loadAdminData(), refreshCatalog()]);
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
    const fallback = adminStacks.find((s) => s.id !== stack.id && !s.archived) ??
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
      if (stackFilter === deletingStack.stack.id) setStackFilter('all');
      await Promise.all([loadAdminData(), refreshCatalog()]);
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

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoting || busyAction) return;
    setBusyAction(true);
    try {
      const newCard: CardItem = {
        id: `C_${Date.now()}`,
        stackId: promoting.stackId,
        kind: promoting.stackId === 'quotes' ? 'quote' : 'question',
        de: promoting.de.trim(),
        en: promoting.en.trim(),
        isCustom: true,
        contributedBy: promoting.sub.authorName,
        createdAt: new Date().toISOString(),
      };
      await updateSubmissionStatus(promoting.sub.id, 'promoted', promoting.stackId, newCard);
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setPromoting(null);
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
      await loadAdminData();
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
      await Promise.all([loadAdminData(), refreshCatalog()]);
      notifyOk(
        isDe
          ? `${res.addedCount} fehlende Standardkarten wiederhergestellt (${res.total} gesamt).`
          : `Restored ${res.addedCount} missing baseline cards (${res.total} total).`,
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

  // ---------- Render: Auth / Loading ----------

  if (!authStatus) {
    return (
      <main
        className="max-w-md mx-auto px-4 py-16 text-center text-sm"
        style={{ color: 'var(--ink-muted)' }}
      >
        {isDe ? 'Lade Studio…' : 'Loading Studio…'}
      </main>
    );
  }

  if (authStatus.mode === 'vercel' && !authStatus.configured) {
    return (
      <main className="max-w-md mx-auto px-4 pt-12 pb-16">
        <div className="noble-bezel p-1.5 rounded-[28px]">
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
    );
  }

  if (authStatus.mode === 'vercel' && !authStatus.authenticated) {
    // One-Button Initial Claim when no admin exists yet
    if (!authStatus.hasAdmin) {
      return (
        <main className="max-w-md mx-auto px-4 pt-10 pb-16">
          <div className="noble-bezel p-1.5 rounded-[28px]">
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
      );
    }

    // Standard Sign In once admin is claimed
    return (
      <main className="max-w-md mx-auto px-4 pt-12 pb-16">
        <div className="noble-bezel p-1.5 rounded-[28px]">
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
    );
  }

  // ---------- Render: Authenticated Studio ----------

  const firstStackId = adminStacks[0]?.id ?? 'warmup';

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
            style={{ color: 'var(--ink-muted)' }}
          >
            <ChevronLeftIcon size={14} />
            <span>{isDe ? 'Zurück' : 'Home'}</span>
          </button>
          <h1 className="font-serif-card text-2xl font-medium m-0">
            {isDe ? 'Kuration & Studio' : 'Curator Studio'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor:
                authStatus.mode === 'vercel' ? 'var(--accent-soft)' : 'var(--elevated)',
              color: authStatus.mode === 'vercel' ? 'var(--accent)' : 'var(--ink-muted)',
            }}
          >
            {authStatus.mode === 'vercel'
              ? 'Vercel Blob Live'
              : isDe
                ? 'Lokal-Modus'
                : 'Local Mode'}
          </span>
          {authStatus.mode === 'vercel' && (
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1 rounded-full text-xs font-medium hover:bg-[var(--elevated)] cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              {isDe ? 'Abmelden' : 'Sign out'}
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className="rounded-2xl px-4 py-2.5 text-xs flex items-center justify-between"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner('')} className="underline cursor-pointer">
            OK
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          className="rounded-2xl px-4 py-2.5 text-xs flex items-center justify-between"
          style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner('')} className="underline cursor-pointer">
            OK
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        className="inline-flex flex-wrap p-1 rounded-full gap-1 text-xs font-medium"
        style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
      >
        {(
          [
            ['cards', isDe ? `Karten (${adminCards.length})` : `Cards (${adminCards.length})`],
            ['stacks', isDe ? `Stapel (${adminStacks.length})` : `Stacks (${adminStacks.length})`],
            ['insights', isDe ? `Auswertung (${ratings.length})` : `Insights (${ratings.length})`],
            ['inbox', isDe ? `Runden-Eingang (${pendingInbox.length})` : `Group Inbox (${pendingInbox.length})`],
            ['security', isDe ? 'Sicherheit & Export' : 'Security & Backup'],
          ] as [AdminTab, string][]
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-full transition-colors cursor-pointer"
              style={{
                backgroundColor: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-muted)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CARDS & QUOTES */}
      {tab === 'cards' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isDe ? 'Suche nach Text, ID oder Autor…' : 'Search text, ID, or author…'}
                className="flex-1 min-w-[200px] rounded-full px-4 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
              <select
                value={stackFilter}
                onChange={(e) => setStackFilter(e.target.value)}
                aria-label="Filter by stack"
                className="rounded-full px-3.5 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
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
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as CardKind | 'all')}
                aria-label="Filter by card kind"
                className="rounded-full px-3.5 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="all">{isDe ? 'Alle Typen' : 'All types'}</option>
                <option value="question">{isDe ? 'Fragen' : 'Questions'}</option>
                <option value="quote">{isDe ? 'Zitate' : 'Quotes'}</option>
                <option value="wildcard">{isDe ? 'Impulse' : 'Wildcards'}</option>
              </select>
              <label
                className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>{isDe ? 'Archivierte zeigen' : 'Show archived'}</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                const defaultStack = stackFilter === 'all' ? firstStackId : stackFilter;
                setEditingCard({
                  id: `C_${Date.now()}`,
                  stackId: defaultStack,
                  kind: defaultStack === 'quotes' ? 'quote' : 'question',
                  de: '',
                  en: '',
                  isCustom: true,
                });
              }}
              className="px-4 py-2 rounded-full text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? '+ Neue Karte' : '+ New Card'}
            </button>
          </div>

          <div className="space-y-2.5">
            {filteredCards.map((card) => {
              const stack = getStackMetaSafe(stackMap, card.stackId);
              const score = ratingSummary[card.id];
              const awaitingConfirm = confirmDeleteCardId === card.id;
              return (
                <div
                  key={card.id}
                  className="rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    opacity: card.archived ? 0.55 : 1,
                  }}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div
                      className="flex flex-wrap items-center gap-2 text-[11px]"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stack.accent }}
                      />
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {isDe ? stack.nameDe : stack.nameEn}
                      </span>
                      <span>· {card.id}</span>
                      <span>· {card.kind}</span>
                      {card.quoteSubdeck && <span>· {card.quoteSubdeck}</span>}
                      {card.ruhiChapter && <span>· Ch. {card.ruhiChapter}</span>}
                      {card.archived && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ backgroundColor: 'var(--elevated)' }}
                        >
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-sm m-0" style={{ color: 'var(--ink)' }}>
                      {isDe ? card.de : card.en}
                    </p>
                    <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
                      {isDe ? card.en : card.de}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {score && (
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] tabular-nums"
                        style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                      >
                        +{score.up} / -{score.down}
                      </span>
                    )}

                    <select
                      value={card.stackId}
                      disabled={busyAction}
                      onChange={(e) => handleMoveCardStack(card, e.target.value)}
                      aria-label={`Move ${card.id} to stack`}
                      title={isDe ? 'Stapel direkt ändern' : 'Reassign stack'}
                      className="rounded-full px-3 py-1.5 text-xs cursor-pointer"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {adminStacks.map((s) => (
                        <option key={s.id} value={s.id}>
                          {isDe ? s.nameDe : s.nameEn}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setEditingCard({ ...card })}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                      style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
                    >
                      {isDe ? 'Bearbeiten' : 'Edit'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(card)}
                      disabled={busyAction}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
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
                          className="px-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                          style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                        >
                          {isDe ? 'Löschen?' : 'Confirm?'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCardId(null)}
                          className="px-2 py-1.5 rounded-full text-xs cursor-pointer"
                          style={{ color: 'var(--ink-muted)' }}
                        >
                          {isDe ? 'Nein' : 'No'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCardId(card.id)}
                        className="px-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80"
                        style={{ color: 'var(--danger)' }}
                      >
                        {isDe ? 'Löschen' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: STACKS MANAGEMENT */}
      {tab === 'stacks' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs m-0" style={{ color: 'var(--ink-muted)' }}>
              {isDe
                ? 'Erstelle neue Stapel, benenne bestehende um, ändere die Reihenfolge oder verschiebe Karten beim Entfernen.'
                : 'Create custom stacks, rename bilingual titles & 1-line subtitles, pick emblems, or reorder the deck grid.'}
            </p>
            <button
              type="button"
              onClick={() =>
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
                })
              }
              className="px-4 py-2 rounded-full text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {isDe ? '+ Neuer Stapel' : '+ New Stack'}
            </button>
          </div>

          <div className="space-y-2.5">
            {adminStacks.map((stack, index) => {
              const counts = cardCountsByStack[stack.id] || { active: 0, total: 0 };
              return (
                <div
                  key={stack.id}
                  className="rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    opacity: stack.archived ? 0.58 : 1,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--subtle)',
                        border: '1px solid var(--gold-hairline)',
                        color: 'var(--gold)',
                      }}
                    >
                      <StackArtwork stackId={stack.id} iconId={stack.iconId} size={24} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif-card text-base font-medium">
                          {isDe ? stack.nameDe : stack.nameEn}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                          / {isDe ? stack.nameEn : stack.nameDe}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                        >
                          #{stack.id} · Ring {stack.ring}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] tabular-nums"
                          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          {counts.active} / {counts.total} {isDe ? 'Karten' : 'cards'}
                        </span>
                        {stack.archived && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px]"
                            style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink-muted)' }}
                          >
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-xs m-0 truncate" style={{ color: 'var(--ink-muted)' }}>
                        {isDe ? stack.subtitleDe : stack.subtitleEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0 || busyAction}
                      onClick={() => handleMoveStackOrder(index, -1)}
                      className="px-2.5 py-1.5 rounded-full text-xs disabled:opacity-35 cursor-pointer"
                      style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                      title={isDe ? 'Nach oben' : 'Move up'}
                    >
                      {isDe ? 'Hoch' : 'Up'}
                    </button>
                    <button
                      type="button"
                      disabled={index === adminStacks.length - 1 || busyAction}
                      onClick={() => handleMoveStackOrder(index, 1)}
                      className="px-2.5 py-1.5 rounded-full text-xs disabled:opacity-35 cursor-pointer"
                      style={{ backgroundColor: 'var(--subtle)', color: 'var(--ink-muted)' }}
                      title={isDe ? 'Nach unten' : 'Move down'}
                    >
                      {isDe ? 'Runter' : 'Down'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingStack({ isNew: false, stack: { ...stack } })}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                      style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
                    >
                      {isDe ? 'Bearbeiten' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleArchiveStackToggle(stack)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
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
                      className="px-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer disabled:opacity-35"
                      style={{ color: 'var(--danger)' }}
                    >
                      {isDe ? 'Entfernen' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: INSIGHTS & RATINGS */}
      {tab === 'insights' && (
        <section className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stackRatingTotals.map(({ stack, up, down, pct }) => (
              <div
                key={stack.id}
                className="rounded-2xl p-4 space-y-1.5"
                style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stack.accent }} />
                  <span className="truncate">{isDe ? stack.nameDe : stack.nameEn}</span>
                </div>
                <div className="font-serif-card text-2xl">{pct === null ? '—' : `${pct}%`}</div>
                <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  +{up} / -{down}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--accent)' }}
              >
                <ThumbUpIcon size={15} />
                <span>{isDe ? 'Beliebteste Karten' : 'Top Resonating Cards'}</span>
              </div>
              {sortedByRating.best.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  {isDe ? 'Noch keine Bewertungen vorhanden.' : 'No card ratings recorded yet.'}
                </p>
              ) : (
                sortedByRating.best.slice(0, 10).map(({ card, score }) => (
                  <div
                    key={card.id}
                    className="pt-2 border-t text-xs flex justify-between gap-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span>{isDe ? card.de : card.en}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--accent)' }}>
                      +{score.up} / -{score.down}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--ink-muted)' }}
              >
                <ThumbDownIcon size={15} />
                <span>{isDe ? 'Kandidaten zum Überarbeiten' : 'Lowest Rated / Review'}</span>
              </div>
              {sortedByRating.worst.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  {isDe ? 'Noch keine Bewertungen vorhanden.' : 'No card ratings recorded yet.'}
                </p>
              ) : (
                sortedByRating.worst.slice(0, 10).map(({ card, score }) => (
                  <div
                    key={card.id}
                    className="pt-2 border-t text-xs flex justify-between gap-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span>{isDe ? card.de : card.en}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                      +{score.up} / -{score.down}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-full text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
          >
            {isDe ? 'Bewertungen als CSV exportieren' : 'Export Ratings CSV'}
          </button>
        </section>
      )}

      {/* TAB 4: GROUP INBOX */}
      {tab === 'inbox' && (
        <section className="space-y-3">
          {pendingInbox.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center text-sm"
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--ink-muted)',
              }}
            >
              {isDe
                ? 'Keine offenen Fragen aus QR-Runden. Eingeworfene Gästefragen erscheinen hier automatisch.'
                : 'No pending guest questions yet. Anything submitted via a QR room appears here for review.'}
            </div>
          ) : (
            pendingInbox.map((sub) => (
              <div
                key={sub.id}
                className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="space-y-1">
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Room {sub.roomCode} · {sub.language.toUpperCase()}
                    {sub.authorName ? ` · ${sub.authorName}` : ' · Anonymous'}
                  </div>
                  <p className="text-sm m-0">{sub.text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPromoting({
                        sub,
                        stackId: firstStackId,
                        de: sub.text,
                        en: sub.text,
                      })
                    }
                    className="px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    {isDe ? 'In Stapel übernehmen' : 'Promote to deck'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleDismissSubmission(sub.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {isDe ? 'Verwerfen' : 'Dismiss'}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB 5: SECURITY & BACKUP */}
      {tab === 'security' && (
        <section className="space-y-5">
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Speicher & Datensicherung' : 'Storage & Backup'}
            </h2>
            <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--ink-muted)' }}>
              {authStatus.mode === 'vercel'
                ? isDe
                  ? `Verbunden mit Vercel Private Blob (${authStatus.email || 'Admin'}). Alle Änderungen an Stapeln, Fragen, Bewertungen und QR-Runden werden sofort live gespeichert.`
                  : `Connected to Vercel Private Blob (signed in as ${authStatus.email || 'Admin'}). Every stack edit, card change, rating, and QR room persists live on the server.`
                : isDe
                  ? 'Aktuell läuft eine lokale Vorschau ohne Server-API. Änderungen bleiben in diesem Browser gespeichert.'
                  : 'Currently running in browser-local preview mode. Deploy on Vercel with Private Blob for synced edits and server-verified login.'}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busyAction}
                onClick={handleReseedMissing}
                className="px-5 py-2.5 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe
                  ? `Fehlende Standardkarten ergänzen (${SEED_CARDS.length} Basis)`
                  : `Restore Missing Baseline Cards (${SEED_CARDS.length} seed)`}
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="px-5 py-2.5 rounded-full text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
              >
                {isDe ? 'Kompletten Katalog als JSON laden' : 'Export Full Catalog JSON'}
              </button>
            </div>
          </div>

          {authStatus.mode === 'vercel' && (
            <form
              onSubmit={handleChangePassword}
              className="rounded-2xl p-6 space-y-3.5 max-w-md"
              style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <h2 className="font-serif-card text-xl font-medium m-0">
                {isDe ? 'Admin-Passwort ändern' : 'Change Admin Password'}
              </h2>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={isDe ? 'Aktuelles Passwort' : 'Current password'}
                className="w-full rounded-full px-4 py-2 text-xs"
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
                placeholder={isDe ? 'Neues Passwort (mind. 8 Zeichen)' : 'New password (min. 8 chars)'}
                className="w-full rounded-full px-4 py-2 text-xs"
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
                className="w-full rounded-full px-4 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
              >
                {isDe ? 'Passwort speichern' : 'Update Password'}
              </button>
            </form>
          )}
        </section>
      )}

      {/* MODAL: Edit / Create Card */}
      {editingCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setEditingCard(null)}
        >
          <form
            onSubmit={handleSaveCard}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Karte bearbeiten' : 'Edit Card'}
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={editingCard.stackId}
                onChange={(e) => {
                  const sid = e.target.value;
                  setEditingCard({
                    ...editingCard,
                    stackId: sid,
                    kind:
                      editingCard.kind === 'wildcard'
                        ? 'wildcard'
                        : sid === 'quotes'
                          ? 'quote'
                          : 'question',
                  });
                }}
                className="rounded-full px-3.5 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              >
                {adminStacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isDe ? s.nameDe : s.nameEn}
                  </option>
                ))}
              </select>

              <select
                value={editingCard.kind}
                onChange={(e) =>
                  setEditingCard({ ...editingCard, kind: e.target.value as CardKind })
                }
                className="rounded-full px-3.5 py-2 text-xs"
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

            {editingCard.kind === 'quote' && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={editingCard.quoteSubdeck || 'general'}
                  onChange={(e) =>
                    setEditingCard({
                      ...editingCard,
                      quoteSubdeck: e.target.value as QuoteSubdeck,
                    })
                  }
                  className="rounded-full px-3.5 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <option value="general">General</option>
                  <option value="ruhi">Ruhi Book 1</option>
                </select>

                {editingCard.quoteSubdeck === 'ruhi' && (
                  <select
                    value={editingCard.ruhiChapter || 1}
                    onChange={(e) =>
                      setEditingCard({
                        ...editingCard,
                        ruhiChapter: Number(e.target.value) as RuhiChapter,
                      })
                    }
                    className="rounded-full px-3.5 py-2 text-xs"
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

            <textarea
              required
              rows={3}
              value={editingCard.de}
              onChange={(e) => setEditingCard({ ...editingCard, de: e.target.value })}
              placeholder="Deutsch (DE)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
            <textarea
              required
              rows={3}
              value={editingCard.en}
              onChange={(e) => setEditingCard({ ...editingCard, en: e.target.value })}
              placeholder="English (EN)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />

            {editingCard.kind === 'quote' ? (
              <>
                <input
                  type="text"
                  value={editingCard.author || ''}
                  onChange={(e) => setEditingCard({ ...editingCard, author: e.target.value })}
                  placeholder="Author"
                  className="w-full rounded-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="url"
                    value={editingCard.sourceUrlDe || ''}
                    onChange={(e) =>
                      setEditingCard({ ...editingCard, sourceUrlDe: e.target.value })
                    }
                    placeholder="Source URL (DE)"
                    className="rounded-full px-4 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      color: 'var(--ink)',
                      border: '1px solid var(--border)',
                    }}
                  />
                  <input
                    type="url"
                    value={editingCard.sourceUrlEn || ''}
                    onChange={(e) =>
                      setEditingCard({ ...editingCard, sourceUrlEn: e.target.value })
                    }
                    placeholder="Source URL (EN)"
                    className="rounded-full px-4 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--subtle)',
                      color: 'var(--ink)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={editingCard.promptDe || ''}
                  onChange={(e) => setEditingCard({ ...editingCard, promptDe: e.target.value })}
                  placeholder="Gesprächsimpuls (DE)"
                  className="w-full rounded-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <input
                  type="text"
                  value={editingCard.promptEn || ''}
                  onChange={(e) => setEditingCard({ ...editingCard, promptEn: e.target.value })}
                  placeholder="Conversation question (EN)"
                  className="w-full rounded-full px-4 py-2 text-xs"
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
                  value={editingCard.digDeeperDe || ''}
                  onChange={(e) =>
                    setEditingCard({ ...editingCard, digDeeperDe: e.target.value })
                  }
                  placeholder={isDe ? 'Optional: Nachfrage (DE)' : 'Optional: Follow-up (DE)'}
                  className="rounded-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
                <input
                  type="text"
                  value={editingCard.digDeeperEn || ''}
                  onChange={(e) =>
                    setEditingCard({ ...editingCard, digDeeperEn: e.target.value })
                  }
                  placeholder={isDe ? 'Optional: Nachfrage (EN)' : 'Optional: Follow-up (EN)'}
                  className="rounded-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--subtle)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Speichern' : 'Save'}
              </button>
            </div>
          </form>
        </div>
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
            className="w-full max-w-lg rounded-3xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
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
                  className="w-full rounded-full px-4 py-2 text-xs"
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
                  className="w-full rounded-full px-4 py-2 text-xs"
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
                className="w-full rounded-full px-4 py-2 text-xs read-only:opacity-60"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
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
                className="w-full rounded-full px-4 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--subtle)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
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
                className="w-full rounded-full px-4 py-2 text-xs"
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
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
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
            className="w-full max-w-md rounded-3xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
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
                  className="w-full rounded-full px-3.5 py-2 text-xs"
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
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {isDe ? 'Endgültig entfernen' : 'Delete Stack'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Promote Group Submission */}
      {promoting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={() => setPromoting(null)}
        >
          <form
            onSubmit={handlePromoteSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl p-6 space-y-3.5"
            style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-strong)' }}
          >
            <h2 className="font-serif-card text-xl font-medium m-0">
              {isDe ? 'Frage in festen Stapel aufnehmen' : 'Promote to Permanent Deck'}
            </h2>
            <select
              value={promoting.stackId}
              onChange={(e) => setPromoting({ ...promoting, stackId: e.target.value })}
              className="w-full rounded-full px-3.5 py-2 text-xs"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            >
              {adminStacks.map((s) => (
                <option key={s.id} value={s.id}>
                  {isDe ? s.nameDe : s.nameEn}
                </option>
              ))}
            </select>
            <textarea
              required
              rows={2}
              value={promoting.de}
              onChange={(e) => setPromoting({ ...promoting, de: e.target.value })}
              placeholder="Deutsch (DE)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
            <textarea
              required
              rows={2}
              value={promoting.en}
              onChange={(e) => setPromoting({ ...promoting, en: e.target.value })}
              placeholder="English (EN)"
              className="w-full rounded-2xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--subtle)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromoting(null)}
                className="px-4 py-2 rounded-full text-xs cursor-pointer"
                style={{ color: 'var(--ink-muted)' }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {isDe ? 'Übernehmen' : 'Promote'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
