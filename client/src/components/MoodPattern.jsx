import React from 'react';

// The faint line drawing of a mood group in the top-right corner of a timeline card, behind the
// mood badge, fading out towards the middle of the card (see moods.js: `useMoods().look`).
// Drawn once as plain SVG (no pictures to load). `pattern`: 'hearts' | 'sun' | 'waves' | 'route' |
// 'bubbles' | 'rain'; `className`: its colour (text-…), it draws with currentColor.

// the same "random" positions every time (so cards don't change between visits)
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const W = 220;
const H = 150;

function hearts() {
  const r = seeded(7);
  return Array.from({ length: 11 }, (_, i) => {
    const x = 20 + r() * 190, y = 10 + r() * 120, s = 0.8 + r() * 0.9, a = -30 + r() * 60;
    return <path key={i} transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`} d="M0 3 C-6 -3 -10 3 0 10 C10 3 6 -3 0 3Z" />;
  });
}

// rays from behind the mood badge
function sun() {
  return Array.from({ length: 13 }, (_, i) => {
    const a = (Math.PI / 2) * (i / 12) + Math.PI / 2;
    const inner = 46, outer = 95 + (i % 2) * 40;
    return <line key={i} x1={196 + Math.cos(a) * inner} y1={28 + Math.sin(a) * inner} x2={196 + Math.cos(a) * outer} y2={28 + Math.sin(a) * outer} />;
  });
}

function waves() {
  return Array.from({ length: 6 }, (_, i) => (
    <path key={i} d={`M0 ${30 + i * 20} q 18 -9 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0`} />
  ));
}

function route() {
  return [
    <path key="r" strokeDasharray="5 6" d="M10 135 C 60 120 50 70 110 75 S 170 40 205 20" />,
    <path key="m" d="M120 140 l28 -42 l16 22 l12 -16 l26 36" />,
    <circle key="c" cx="205" cy="20" r="4" />,
  ];
}

function bubbles() {
  const r = seeded(3);
  return Array.from({ length: 9 }, (_, i) => <circle key={i} cx={20 + r() * 190} cy={10 + r() * 125} r={3 + r() * 11} />);
}

function rain() {
  const r = seeded(11);
  return Array.from({ length: 22 }, (_, i) => {
    const x = r() * W, y = r() * 140;
    return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 13} />;
  });
}

const DRAWINGS = { hearts: hearts(), sun: sun(), waves: waves(), route: route(), bubbles: bubbles(), rain: rain() };

// fades out from the top-right corner (React sets it through the style object, which the
// Content-Security-Policy allows)
const FADE = 'radial-gradient(ellipse 100% 100% at 100% 0%, #000 25%, transparent 100%)';

export default function MoodPattern({ pattern, className = '' }) {
  const drawing = DRAWINGS[pattern];
  if (!drawing) return null;
  return (
    <svg
      className={`absolute top-0 right-0 w-[220px] h-[150px] pointer-events-none ${className}`}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      aria-hidden="true"
      data-testid="mood-pattern"
      data-pattern={pattern}
    >
      {drawing}
    </svg>
  );
}
