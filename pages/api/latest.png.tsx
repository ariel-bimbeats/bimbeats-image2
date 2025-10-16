import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Canvas + layout knobs
const WIDTH = 1200;
const HEIGHT = 340;
const PADDING = 20;
const MIN_FONT = 36;
const MAX_FONT = 56;
const LINE_HEIGHT = 1.3;
const CHAR_WIDTH_FACTOR = 0.55; // approx width factor for Helvetica

// --- Minimal inline markup: [[EMPHASIZE]] and \n for line breaks ---
// strip markers for measurement
function stripMarkers(s: string): string {
  return s.replace(/\[\[(.+?)\]\]/g, '$1');
}

// turn "foo [[bar]] baz" into segments we can style
type Seg = { text: string; emph: boolean } | { br: true };
function tokenize(s: string): Seg[] {
  // support "\n" inside a bullet
  const parts = s.split(/\\n/g);
  const out: Seg[] = [];
  for (let idx = 0; idx < parts.length; idx++) {
    const p = parts[idx];
    const tokens = p.split(/(\[\[(?:.+?)\]\])/g).filter(Boolean);
    for (const t of tokens) {
      const m = t.match(/^\[\[(.+?)\]\]$/);
      if (m) out.push({ text: m[1], emph: true });
      else out.push({ text: t, emph: false });
    }
    if (idx < parts.length - 1) out.push({ br: true });
  }
  return out;
}

export default async function handler() {
  // 1) fetch bullets
  const src = process.env.BULLET_SRC!;
  const res = await fetch(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets = [] } = (await res.json()) as { bullets: string[] };
  const items = Array.isArray(bullets) && bullets.length ? bullets : ['No updates available'];

  // 2) pick a font size that fits (measure plain text without markers)
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;

  const plainItems = items.map(stripMarkers);
  const longestLen = plainItems.reduce((m, s) => Math.max(m, (s ?? '').length), 0);

  const fits = (fs: number) => {
    const gap = Math.round(fs * 0.5);
    const lineBox = fs * LINE_HEIGHT;
    const neededH = items.length * lineBox + Math.max(0, items.length - 1) * gap;
    if (neededH > contentH) return false;

    const gutter = Math.round(fs * 2.0); // space for bullet dot
    const textW = longestLen * (fs * CHAR_WIDTH_FACTOR);
    return gutter + textW <= contentW;
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

  // emphasis style (highlight or darker color – pick one)
  const emphStyle: Record<string, string | number> = {
    backgroundColor: '#E6F7F7',
    padding: '0 6px',
    borderRadius: 4
    // Or instead: color: '#008a8a';
  };

  // 3) render
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
            const segs = tokenize(line);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(fontSize * 0.7) }}>
                <span style={{ fontSize: bulletDotSize, lineHeight: 1 }}>•</span>
                <span
                  style={{
                    display: 'block',
                    fontSize,
                    lineHeight: LINE_HEIGHT,
                    maxWidth: maxTextWidth,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {segs.map((s, j) =>
                    'br' in s ? (
                      <br key={j} />
                    ) : s.emph ? (
                      <span key={j} style={emphStyle}>
                        {s.text}
                      </span>
                    ) : (
                      <span key={j}>{s.text}</span>
                    )
                  )}
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
