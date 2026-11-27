import React, { Suspense, lazy } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { FavoritesDrawer } from './components/FavoritesDrawer';
import { GroupQrModal } from './components/GroupQrModal';
import { IslandNav } from './components/IslandNav';
import { MobileGlassBar } from './components/MobileGlassBar';
import { WelcomeIntro } from './components/WelcomeIntro';
import { ResonanceProvider, useResonance } from './context/ResonanceContext';
import { HomePage } from './pages/HomePage';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { PlayPage } from './pages/PlayPage';

const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const ReviewPage = lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);

const AppRouter: React.FC = () => {
  const { route, qrModalOpen, favoritesOpen, introOpen, lang } = useResonance();

  let page: React.ReactNode = <HomePage />;
  if (route === '/play') {
    page = <PlayPage />;
  } else if (route.startsWith('/join/')) {
    const code = route.replace('/join/', '').split('/')[0] || '';
    page = <JoinRoomPage roomCode={code} />;
  } else if (route === '/review' || route.startsWith('/review/')) {
    page = <ReviewPage />;
  } else if (route === '/admin') {
    page = <AdminPage />;
  }

  return (
    <div className="min-h-[100dvh] relative flex flex-col">
      {/* Subtle full-canvas cotton paper grain */}
      <div aria-hidden="true" className="page-grain" />

      <div className="relative z-10 flex-1 flex flex-col">
        <IslandNav />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            <Suspense
              fallback={
                <div
                  className="py-16 text-center text-xs"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {lang === 'de' ? 'Lade…' : 'Loading…'}
                </div>
              }
            >
              {page}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      <MobileGlassBar />

      <AnimatePresence>
        {qrModalOpen && <GroupQrModal key="qr-modal" />}
        {favoritesOpen && <FavoritesDrawer key="fav-drawer" />}
        {introOpen && <WelcomeIntro key="welcome-intro" />}
      </AnimatePresence>
    </div>
  );
};

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ResonanceProvider>
        <AppRouter />
      </ResonanceProvider>
    </MotionConfig>
  );
}

export default App;
