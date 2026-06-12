'use client';

import { useEffect, useMemo, useState } from 'react';

interface CelebrationOverlayProps {
  show: boolean;
  onComplete?: () => void;
}

interface ConfettiPiece {
  id: number;
  left: string;
  delay: string;
  duration: string;
  color: string;
  size: number;
  rotation: number;
}

const CONFETTI_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
];

function makeConfettiPieces(): ConfettiPiece[] {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.5}s`,
    duration: `${2 + Math.random() * 2}s`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 4 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));
}

export default function CelebrationOverlay({ show, onComplete }: CelebrationOverlayProps) {
  // Seeded from `show` so a mount with show=true is visible on the very
  // first render; later show-transitions are reconciled in the
  // adjust-state-during-render block below.
  const [isVisible, setIsVisible] = useState(show);
  const [isAnimating, setIsAnimating] = useState(show);

  // React to `show` flipping true during render rather than in an
  // effect — the React-sanctioned pattern for deriving state from a
  // prop change (the old synchronous setState-in-effect version is
  // flagged by the React 19 compiler lint and cost an extra
  // render-commit-render cycle).
  const [prevShow, setPrevShow] = useState(show);
  if (prevShow !== show) {
    setPrevShow(show);
    if (show) {
      setIsVisible(true);
      setIsAnimating(true);
    }
  }

  // Timers only — the async callbacks are allowed to set state.
  useEffect(() => {
    if (!show) return;

    // Start fade out after 2.5s
    const fadeTimer = setTimeout(() => {
      setIsAnimating(false);
    }, 2500);

    // Remove from DOM after fade completes
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [show, onComplete]);

  // Generate one set of confetti per show-cycle. Calling Math.random()
  // directly in render regenerated every piece's position/timing on each
  // re-render (and this component re-renders mid-animation when
  // isAnimating flips), making the confetti visibly jump — it also
  // violates render purity. useMemo keyed on `show` keeps the pieces
  // stable for the whole animation. Hooks must run unconditionally, so
  // this sits above the early return.
  const confettiPieces = useMemo<ConfettiPiece[]>(
    () => (show ? makeConfettiPieces() : []),
    [show],
  );

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] pointer-events-none transition-opacity duration-500 ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Subtle radial gradient background pulse */}
      <div className="absolute inset-0 bg-gradient-radial from-green-500/10 via-transparent to-transparent animate-pulse-slow" />
      
      {/* Confetti pieces */}
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        >
          <div
            className="animate-confetti-spin"
            style={{
              width: piece.size,
              height: piece.size * 0.6,
              backgroundColor: piece.color,
              borderRadius: '2px',
              transform: `rotate(${piece.rotation}deg)`,
            }}
          />
        </div>
      ))}

      {/* Center thank you message */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className={`transform transition-all duration-500 ${
            isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          <div className="bg-[color:rgb(253_250_243_/0.95)] backdrop-blur-sm px-8 py-4 rounded-2xl shadow-2xl border border-[var(--success-border)]">
            <div className="flex items-center gap-3">
              {/* Animated checkmark */}
              <div className="relative w-10 h-10">
                <svg 
                  className="w-10 h-10 text-[var(--success-foreground)]" 
                  viewBox="0 0 40 40"
                >
                  <circle
                    className="animate-circle-draw"
                    cx="20"
                    cy="20"
                    r="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    className="animate-check-draw"
                    d="M12 20 L18 26 L28 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-stone-900">Thank you!</p>
                <p className="text-sm text-stone-600">Your report helps improve the data</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Particle burst from center */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-2 h-2 rounded-full bg-[var(--success-border)] animate-particle-burst"
            style={{
              '--particle-angle': `${(i * 30)}deg`,
              animationDelay: `${i * 0.02}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes confetti-spin {
          0%, 100% {
            transform: rotateX(0deg) rotateY(0deg);
          }
          25% {
            transform: rotateX(90deg) rotateY(90deg);
          }
          50% {
            transform: rotateX(180deg) rotateY(180deg);
          }
          75% {
            transform: rotateX(270deg) rotateY(270deg);
          }
        }

        @keyframes circle-draw {
          0% {
            stroke-dasharray: 0 120;
          }
          100% {
            stroke-dasharray: 120 0;
          }
        }

        @keyframes check-draw {
          0% {
            stroke-dasharray: 0 30;
          }
          100% {
            stroke-dasharray: 30 0;
          }
        }

        @keyframes particle-burst {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(cos(var(--particle-angle)) * 150px),
              calc(sin(var(--particle-angle)) * 150px)
            ) scale(0);
            opacity: 0;
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }

        .animate-confetti-fall {
          animation: confetti-fall linear forwards;
        }

        .animate-confetti-spin {
          animation: confetti-spin 1s linear infinite;
        }

        .animate-circle-draw {
          stroke-dasharray: 0 120;
          animation: circle-draw 0.4s ease-out forwards;
        }

        .animate-check-draw {
          stroke-dasharray: 0 30;
          animation: check-draw 0.3s ease-out 0.3s forwards;
        }

        .animate-particle-burst {
          animation: particle-burst 0.6s ease-out forwards;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }

        .bg-gradient-radial {
          background: radial-gradient(circle at center, var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to));
        }
      `}</style>
    </div>
  );
}
