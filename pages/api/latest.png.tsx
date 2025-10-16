import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Canvas + layout knobs (yours)
const WIDTH = 1200;
const HEIGHT = 340;
const PADDING = 20;
const MIN_FONT = 36;
const MAX_FONT = 56;
const LINE_HEIGHT = 1.3;
const CHAR_WIDTH_FACTOR = 0.55; // approx width factor for Helvetica

// --- inline markdown helpers: **bold**, *italic* ---
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');
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
  // 1) fetch bullets
  const src = process.env.BULLET_SRC!;
  const res = await fetch(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets = [] } = (await res.json()) as { bullets: string[] };
  const items = Array.isArray(bullets) && bullets.length ? bullets : ['No updates available'];

  // 2) choose a font size that fits (measure plain text)
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;
  const plainItems = items.map(stripMd);
  const longestLen = plainItems.reduce((m, s) => Math.max(m, (s ?? '').length), 0);

  const fits = (fs: number) => {
    const gap = Math.round(fs * 0.5);
    const lineBox = fs * LINE_HEIGHT;
    const neededH = items.length * lineBox + Math.max(0, items.length - 1) * gap;
    if (neededH > contentH) return false;

    const gutter = Math.round(fs * 2.0); // space for bullet dot
    const textW = longestLen * (fs * CHAR_WIDTH_FACTOR);
    const neededW = gutter + textW;
    return neededW <= contentW;
  };

  let fontSize = MIN_FONT;
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) {
    if (fits(fs)) { fontSize = fs; break; }
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
          {items.map((t, i) => {
            const tokens = tokenizeMd(t);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(fontSize * 0.7) }}>
                <span style={{ fontSize: bulletDotSize, lineHeight: 1 }}>•</span>

                {/* FLEX-WRAP container for inline segments */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    fontSize,
                    lineHeight: LINE_HEIGHT,
                    maxWidth: maxTextWidth
                  }}
                >
                  {tokens.map((tok, j) => (
                    <div
                      key={j}
                      style={{
                        fontWeight: tok.bold ? 700 : 400,
                        fontStyle: tok.italic ? 'italic' : 'normal',
                        // no margins so segments sit flush
                      }}
                    >
                      {tok.text}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT
