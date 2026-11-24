import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { useResonance } from '../context/ResonanceContext';
import { STACKS } from '../data/stacks';
import type { StackId } from '../types/deck';
import { CheckIcon, CloseIcon, QrIcon } from './Icons';

const MODAL_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 30,
};

export const GroupQrModal: React.FC = () => {
  const {
    lang,
    setQrModalOpen,
    activeRoom,
    incomingSubmissions,
    startGroupRoom,
    closeGroupRoom,
    playMode,
    navigate,
  } = useResonance();

  const [timerMinutes, setTimerMinutes] = useState<number>(3);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const joinUrl = activeRoom
    ? `${window.location.origin}${import.meta.env.BASE_URL}join/${activeRoom.code}`
    : '';

  useEffect(() => {
    if (!joinUrl) {
      setQrSvg('');
      return;
    }
    QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      width: 200,
      color: {
        dark: '#162422',
        light: '#FCFBF7',
      },
    })
      .then(setQrSvg)
      .catch(() => {});
  }, [joinUrl]);

  const currentStacks: StackId[] =
    playMode.type === 'stacks'
      ? playMode.stackIds
      : STACKS.filter((s) => s.id !== 'quotes').map((s) => s.id);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await startGroupRoom(currentStacks, timerMinutes > 0 ? timerMinutes : undefined);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const isDe = lang === 'de';

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={isDe ? 'QR-Runde' : 'QR Group Pile'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--scrim)' }}
      onClick={() => setQrModalOpen(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={MODAL_SPRING}
        className="w-full max-w-md p-1.5 rounded-[28px]"
        style={{
          backgroundColor: 'var(--subtle)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cardstock rounded-[22px] p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <QrIcon size={17} />
              </div>
              <div>
                <h2 className="font-serif-card text-xl font-medium m-0">
                  {isDe ? 'Gemeinsame Runde' : 'Group Question Pile'}
                </h2>
                <p className="text-xs m-0 mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                  {isDe
                    ? 'Alle scannen und werfen anonym Fragen in den Stapel.'
                    : 'Friends scan to drop anonymous questions straight into the pile.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--elevated)] cursor-pointer"
              style={{ color: 'var(--ink-muted)' }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {!activeRoom ? (
              <motion.div
                key="qr-setup"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <div>
                  <label
                    className="block text-xs font-medium mb-2"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {isDe ? 'Zeitfenster zum Sammeln' : 'Collection window'}
                  </label>
                  <div className="flex items-center gap-2">
                    {[3, 5, 0].map((mins) => {
                      const active = timerMinutes === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setTimerMinutes(mins)}
                          className="flex-1 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active ? 'var(--accent)' : 'var(--elevated)',
                            color: active ? 'var(--accent-ink)' : 'var(--ink)',
                          }}
                        >
                          {mins === 0 ? (isDe ? 'Ohne Limit' : 'Open') : `${mins} min`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  {creating
                    ? isDe
                      ? 'Erstelle Code…'
                      : 'Creating code…'
                    : isDe
                      ? 'QR-Code für Runde erzeugen'
                      : 'Generate QR Code'}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="qr-active"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                {/* Crisp QR code frame */}
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="p-3 rounded-2xl"
                    style={{ backgroundColor: '#FCFBF7', border: '1px solid var(--border)' }}
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <div className="text-center">
                    <div
                      className="text-xs font-medium"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {isDe ? 'Raumcode' : 'Room code'}
                    </div>
                    <div className="font-serif-card text-2xl tracking-[0.18em] font-medium mt-0.5">
                      {activeRoom.code}
                    </div>
                  </div>
                </div>

                {/* Live count */}
                <div
                  className="rounded-2xl px-4 py-3 flex items-center justify-between text-xs"
                  style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--ink-muted)' }}>
                    {isDe ? 'Eingeworfene Fragen' : 'Questions added to pile'}
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                    {incomingSubmissions.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex-1 py-2.5 rounded-full text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    style={{ backgroundColor: 'var(--elevated)', color: 'var(--ink)' }}
                  >
                    {copied && <CheckIcon size={13} />}
                    <span>
                      {copied
                        ? isDe
                          ? 'Link kopiert'
                          : 'Link copied'
                        : isDe
                          ? 'Link kopieren'
                          : 'Copy invite link'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQrModalOpen(false);
                      navigate(`/join/${activeRoom.code}`);
                    }}
                    className="px-4 py-2.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    {isDe ? 'Vorschau' : 'Preview'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={closeGroupRoom}
                    className="text-xs hover:opacity-80 cursor-pointer"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {isDe ? 'Runde beenden' : 'End room'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrModalOpen(false)}
                    className="px-5 py-2 rounded-full text-xs font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    {isDe ? 'Zurück zum Stapel' : 'Back to deck'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
