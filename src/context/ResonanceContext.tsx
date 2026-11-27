import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buildStackMap } from '../data/stacks';
import {
  createGroupRoom,
  fetchCatalog,
  fetchSubmissions,
  SEED_CARDS,
  SEED_STACKS,
  subscribeToRoomSubmissions,
} from '../services/repository';
import type {
  CardItem,
  GroupRoom,
  GroupSubmission,
  Language,
  PlayMode,
  StackId,
  StackMeta,
  ThemeMode,
} from '../types/deck';

const LS_LANG = 'resonance.lang.v1';
const LS_THEME = 'resonance.theme';
const LS_FAVORITES = 'resonance.favorites.v1';
const LS_INTRO = 'resonance.introSeen.v1';

const BASE_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, '');

function getRelativeRoute(): string {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname || '/';
  if (BASE_PREFIX && pathname.startsWith(BASE_PREFIX)) {
    const trimmed = pathname.slice(BASE_PREFIX.length);
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  return pathname;
}

function toPublicPath(appPath: string): string {
  const normalized = appPath.startsWith('/') ? appPath : `/${appPath}`;
  if (!BASE_PREFIX) return normalized;
  return normalized === '/' ? `${BASE_PREFIX}/` : `${BASE_PREFIX}${normalized}`;
}

interface ResonanceContextValue {
  lang: Language;
  toggleLang: () => void;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  stacks: StackMeta[];
  stackMap: Record<StackId, StackMeta>;
  cards: CardItem[];
  refreshCatalog: () => Promise<void>;
  refreshCards: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (cardId: string) => void;
  isFavorite: (cardId: string) => boolean;
  playMode: PlayMode;
  startPlay: (mode: PlayMode) => void;
  updatePlayMode: (mode: PlayMode) => void;
  focusCardId: string | null;
  openCardDirectly: (cardId: string) => void;
  clearFocusCard: () => void;
  route: string;
  navigate: (path: string) => void;
  activeRoom: GroupRoom | null;
  incomingSubmissions: GroupSubmission[];
  startGroupRoom: (stackIds: StackId[], timerMinutes?: number) => Promise<GroupRoom>;
  closeGroupRoom: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  favoritesOpen: boolean;
  setFavoritesOpen: (open: boolean) => void;
  introOpen: boolean;
  openIntro: () => void;
  dismissIntro: () => void;
}

const ResonanceContext = createContext<ResonanceContextValue | null>(null);

export const ResonanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(LS_LANG);
    if (saved === 'de' || saved === 'en') return saved;
    return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de')
      ? 'de'
      : 'en';
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(LS_THEME);
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  const [stacks, setStacks] = useState<StackMeta[]>(SEED_STACKS);
  const [cards, setCards] = useState<CardItem[]>(SEED_CARDS);
  const stackMap = useMemo(() => buildStackMap(stacks), [stacks]);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_FAVORITES);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [route, setRoute] = useState<string>(getRelativeRoute);
  const [playMode, setPlayMode] = useState<PlayMode>({ type: 'journey', length: 25 });
  const [focusCardId, setFocusCardId] = useState<string | null>(null);

  const [activeRoom, setActiveRoom] = useState<GroupRoom | null>(null);
  const [incomingSubmissions, setIncomingSubmissions] = useState<GroupSubmission[]>([]);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState<boolean>(() => {
    try {
      const path = getRelativeRoute();
      if (path.startsWith('/join/') || path.startsWith('/admin') || path.startsWith('/review')) {
        return false;
      }
      return localStorage.getItem(LS_INTRO) !== '1';
    } catch {
      return false;
    }
  });

  const catalogLoadedRef = useRef(false);

  const refreshCatalog = useCallback(async () => {
    try {
      const loaded = await fetchCatalog(false);
      catalogLoadedRef.current = true;
      setStacks(loaded.stacks);
      setCards(loaded.cards);
    } catch {
      // Keep seed catalog if offline/uninitialized
    }
  }, []);

  const refreshCards = refreshCatalog;

  useEffect(() => {
    if (!route.startsWith('/admin') && !catalogLoadedRef.current) {
      refreshCatalog();
    }
  }, [route, refreshCatalog]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS_THEME, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0F1514' : '#F4F1EA');
    }
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setRoute(getRelativeRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Subscribe to live QR room submissions whenever host opens a room
  useEffect(() => {
    if (!activeRoom) return;
    let active = true;

    fetchSubmissions(activeRoom.code).then((existing) => {
      if (active) setIncomingSubmissions(existing);
    });

    const unsub = subscribeToRoomSubmissions(activeRoom.code, (sub) => {
      setIncomingSubmissions((prev) => {
        if (prev.some((p) => p.id === sub.id)) return prev;
        return [sub, ...prev];
      });
    });

    return () => {
      active = false;
      unsub();
    };
  }, [activeRoom]);

  const navigate = useCallback((path: string) => {
    const publicPath = toPublicPath(path);
    if (window.location.pathname !== publicPath) {
      window.history.pushState({}, '', publicPath);
    }
    setRoute(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(LS_LANG, next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'de' ? 'en' : 'de');
  }, [lang, setLang]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleFavorite = useCallback((cardId: string) => {
    setFavorites((prev) => {
      const exists = prev.includes(cardId);
      const next = exists ? prev.filter((id) => id !== cardId) : [cardId, ...prev];
      localStorage.setItem(LS_FAVORITES, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((cardId: string) => favorites.includes(cardId), [favorites]);

  const startPlay = useCallback(
    (mode: PlayMode) => {
      setFocusCardId(null);
      setPlayMode(mode);
      navigate('/play');
    },
    [navigate],
  );

  const updatePlayMode = useCallback((mode: PlayMode) => {
    setFocusCardId(null);
    setPlayMode(mode);
  }, []);

  const openCardDirectly = useCallback(
    (cardId: string) => {
      const target = cards.find((c) => c.id === cardId);
      if (target) {
        setPlayMode({
          type: 'stacks',
          stackIds: [target.stackId],
          quoteSubdeck: target.quoteSubdeck || 'all',
        });
      }
      setFocusCardId(cardId);
      setFavoritesOpen(false);
      navigate('/play');
    },
    [cards, navigate],
  );

  const clearFocusCard = useCallback(() => setFocusCardId(null), []);

  const startGroupRoom = useCallback(async (stackIds: StackId[], timerMinutes?: number) => {
    const room = await createGroupRoom(stackIds, timerMinutes);
    setActiveRoom(room);
    setIncomingSubmissions([]);
    return room;
  }, []);

  const closeGroupRoom = useCallback(() => {
    setActiveRoom(null);
    setIncomingSubmissions([]);
  }, []);

  const openIntro = useCallback(() => setIntroOpen(true), []);

  const dismissIntro = useCallback(() => {
    setIntroOpen(false);
    try {
      localStorage.setItem(LS_INTRO, '1');
    } catch {
      // Ignore storage failure
    }
  }, []);

  return (
    <ResonanceContext.Provider
      value={{
        lang,
        toggleLang,
        setLang,
        theme,
        toggleTheme,
        stacks,
        stackMap,
        cards,
        refreshCatalog,
        refreshCards,
        favorites,
        toggleFavorite,
        isFavorite,
        playMode,
        startPlay,
        updatePlayMode,
        focusCardId,
        openCardDirectly,
        clearFocusCard,
        route,
        navigate,
        activeRoom,
        incomingSubmissions,
        startGroupRoom,
        closeGroupRoom,
        qrModalOpen,
        setQrModalOpen,
        favoritesOpen,
        setFavoritesOpen,
        introOpen,
        openIntro,
        dismissIntro,
      }}
    >
      {children}
    </ResonanceContext.Provider>
  );
};

export function useResonance(): ResonanceContextValue {
  const ctx = useContext(ResonanceContext);
  if (!ctx) throw new Error('useResonance must be used inside ResonanceProvider');
  return ctx;
}
