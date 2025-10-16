import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' }; // Vercel edge runtime

// Canvas + layout knobs
const WIDTH = 1200;
const HEIGHT = 340;
const PADDING = 20;
const MIN_FONT = 36;
const MAX_FONT = 56;
const LINE_HEIGHT = 1.3;
const CHAR_WIDTH_FACTOR = 0.55;

export default async function handler() {
  // 1) fetch bullets
  const src = process.env.BULLET_SRC!;
  const res = await fetch(
    `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets = [] } = (await res.json()) as { bullets: string[] };

  // Safety: if empty, show a placeholder line
  const items = Array.isArray(bullets) && bullets.length ? bullets : ['No updates available'];

  // 2) pick a font size that fits both height and width
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;
  const longestLen = items.reduce((m, s) => Math.max(m, (s ?? '').length), 0);

  const fits = (fs: number) => {
    // vertical fit
    const gap = Math.round(fs * 0.5);         // space between rows
    const lineBox = fs * LINE_HEIGHT;         // row height
    const neededH = items.length * lineBox + Math.max(0, items.length - 1) * gap;
    if (neededH > contentH) return false;

    // horizontal fit (approximate)
    const gutter = Math.round(fs * 2.0);      // dot + spacing area
    const textW = longestLen * (fs * CHAR_WIDTH_FACTOR);
    const neededW = gutter + textW;
    return neededW <= contentW;
  };

  let fontSize = MIN_FONT;
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) {
    if (fits(fs)) { fontSize = fs; break; }
  }

  // final derived metrics
  const gap = Math.round(fontSize * 0.5);
  const bulletDotSize = Math.round(fontSize * 1.2);
  const gutter = Math.round(fontSize * 2.0);
  const maxTextWidth = contentW - gutter; // safety if a line is insanely long

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
            // constrain the column so long words can wrap instead of cropping
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
                  wordBreak: 'break-word', // last-resort wrap
                  overflow: 'hidden'       // prevent OG quirks
                }}
              >
                {t}
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
