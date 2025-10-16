import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Canvas + layout knobs
const WIDTH = 1200;
const HEIGHT = 340;
const PADDING = 20;
const MIN_FONT = 36;
const MAX_FONT = 36;
const LINE_HEIGHT = 1.3;
const CHAR_WIDTH_FACTOR = 0.55;

// Helpers
function stripMd(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
}
type Tok = { text: string; bold?: boolean; italic?: boolean };
function tokenizeMd(text: string): Tok[] {
  const parts = text.match(/\*\*[^*]+\*\*|\*[^*]+\*|[^*]+/g) || [text];
  return parts.map((p) => {
    if (p.startsWith('**') && p.endsWith('**')) return { text: p.slice(2, -2), bold: true };
    if (p.startsWith('*') && p.endsWith('*')) return { text: p.slice(1, -1), italic: true };
    return { text: p };
  });
}

export default async function handler() {
  const src = process.env.BULLET_SRC!;
  const res = await fetch(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets = [] } = (await res.json()) as { bullets: string[] };
  const items = Array.isArray(bullets) && bullets.length ? bullets : ['No updates available'];

  // choose a font size that fits (measure plain text)
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;
  const plainItems = items.map(stripMd);
  const longestLen = plainItems.reduce((m, s) => Math.max(m, (s ?? '').length), 0);

  const fits = (fs: number) => {
    const gap = Math.round(fs * 0.5);
    const lineBox = fs * LINE_HEIGHT;
    const neededH = items.length * lineBox + Math.max(0, items.length - 1) * gap;
    if (neededH > contentH) return false;

    const gutter = Math.round(fs * 2.0);
    const textW = longestLen * (fs * CHAR_WIDTH_FACTOR);
    return gutter + textW <= contentW;
  };

  let fontSize = MIN_FONT;
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) if (fits(fs)) { fontSize = fs; break; }

  const gap = Math.round(fontSize * 0.5);
  const bulletDotSize = Math.round(fontSize * 1.2);
  const gutter = Math.round(fontSize * 2.0);
  const maxTextWidth = contentW - gutter;

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
        <div style={{ display: 'flex', flexDirection: 'column', gap, width: contentW }}>
          {items.map((line, i) => {
            const tokens = tokenizeMd(line);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(fontSize * 0.7) }}>
                <span style={{ fontSize: bulletDotSize, lineHeight: 1 }}>•</span>

                {/* Inline flow container with explicit display */}
                <span
                  style={{
                    display: 'block',           // explicit display to satisfy og
                    fontSize,
                    lineHeight: LINE_HEIGHT,
                    maxWidth: maxTextWidth,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {tokens.map((tok, j) => (
                    <span
                      key={j}
                      style={{
                        fontWeight: tok.bold ? 700 : 400,
                        fontStyle: tok.italic ? 'italic' : 'normal'
                      }}
                    >
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: { 'Cache-Control': 'no-store' } }
  );
}
