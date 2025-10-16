import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Canvas + layout knobs (yours)
const WIDTH = 1200;
const HEIGHT = 340;
const PADDING = 20;
const MIN_FONT = 24;
const MAX_FONT = 48;
const LINE_HEIGHT = 1.3;
const CHAR_WIDTH_FACTOR = 0.55; // approx width factor for Helvetica

// --- tiny helpers for inline markdown ----
// Strip **bold** and *italic* markers for measurement
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');
}

// Convert **bold** / *italic* into <span> elements for @vercel/og
function renderInlineMd(text: string, fontSize: number) {
  // Tokenize into bold, italics, or plain segments
  const tokens = text.match(/\*\*[^*]+\*\*|\*[^*]+\*|[^*]+/g) || [text];

  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      const inner = tok.slice(2, -2);
      return (
        <span key={`b${i}`} style={{ fontWeight: 700 }}>
          {inner}
        </span>
      );
    }
    if (tok.startsWith('*') && tok.endsWith('*')) {
      const inner = tok.slice(1, -1);
      return (
        <span key={`i${i}`} style={{ fontStyle: 'italic' }}>
          {inner}
        </span>
      );
    }
    return <span key={`t${i}`}>{tok}</span>;
  });
}

export default async function handler() {
  // 1) fetch bullets
  const src = process.env.BULLET_SRC!;
  const res = await fetch(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets = [] } = (await res.json()) as { bullets: string[] };
  const items = Array.isArray(bullets) && bullets.length ? bullets : ['No updates available'];

  // 2) choose a font size that fits
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;

  // Measure using *plain* text (no markdown markers)
  const plainItems = items.map(stripMd);
  const longestLen = plainItems.reduce((m, s) => Math.max(m, (s ?? '').length), 0);

  const fits = (fs: number) => {
    // vertical
    const gap = Math.round(fs * 0.5);
    const lineBox = fs * LINE_HEIGHT;
    const neededH = items.length * lineBox + Math.max(0, items.length - 1) * gap;
    if (neededH > contentH) return false;

    // horizontal (approx on longest line)
    const gutter = Math.round(fs * 2.0); // bullet area
    const textW = longestLen * (fs * CHAR_WIDTH_FACTOR);
    const neededW = gutter + textW;
    return neededW <= contentW;
  };

  let fontSize = MIN_FONT;
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) {
    if (fits(fs)) {
      fontSize = fs;
      break;
    }
  }

  // derived metrics
  const gap = Math.round(fontSize * 0.5);
  const bulletDotSize = Math.round(fontSize * 1.2);
  const gutter = Math.round(fontSize * 2.0);
  const maxTextWidth = contentW - gutter;

  // 3) render image
  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          background: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
          color: '#00b3b3',
          display: 'flex',
          flexDirection: 'column',
          padding: PADDING
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap,
            width: contentW
          }}
        >
          {items.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(fontSize * 0.7) }}>
              <span style={{ fontSize: bulletDotSize, lineHeight: 1 }}>•</span>
              <span
                style={{
                  fontSize,
                  lineHeight: LINE_HEIGHT,
                  flex: 1,
                  maxWidth: maxTextWidth,
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  whiteSpace: 'pre-wrap' // allow \n in a bullet if you ever add them
                }}
              >
                {renderInlineMd(t, fontSize)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
