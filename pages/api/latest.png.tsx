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

// --- allow tiny, safe HTML-like markup: <b>, <i>, <br> ---
type Seg =
  | { kind: 'text'; text: string }
  | { kind: 'b'; text: string }
  | { kind: 'i'; text: string }
  | { kind: 'br' };

/** Remove tags for measuring text width/height */
function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, '').replace(/<\/?i>/g, '').replace(/<br\s*\/?>/gi, '');
}

/** Very small tokenizer for <b>...</b>, <i>...</i>, and <br> */
function tokenizeHtmlMini(s: string): Seg[] {
  const out: Seg[] = [];
  // Replace <br> with a sentinel to split easily
  const withBreaks = s.replace(/<br\s*\/?>/gi, '[[BR]]');
  // Split on <b>..</b> and <i>..</i>
  // Pattern finds b or i blocks; everything else is plain.
  const re = /<b>(.*?)<\/b>|<i>(.*?)<\/i>|(\[\[BR\]\])|([^<\[]+)/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withBreaks))) {
    if (m[1] != null) {
      out.push({ kind: 'b', text: m[1] });
    } else if (m[2] != null) {
      out.push({ kind: 'i', text: m[2] });
    } else if (m[3] != null) {
      out.push({ kind: 'br' });
    } else if (m[4] != null) {
      out.push({ kind: 'text', text: m[4] });
    }
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

  // 2) choose a font size that fits (measure plain text)
  const contentW = WIDTH - PADDING * 2;
  const contentH = HEIGHT - PADDING * 2;

  const plainItems = items.map(stripTags);
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

  // Highlight style instead of true bold to avoid @vercel/og spacing bugs
  const highlightStyle = {
    backgroundColor: '#E6F7F7', // subtle teal highlight
    padding: '0 4px',
    borderRadius: 4
  } as const;

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
            const segs = tokenizeHtmlMini(line);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(fontSize * 0.7) }}>
                <span style={{ fontSize: bulletDotSize, lineHeight: 1 }}>•</span>

                {/* single text flow; spans are purely stylistic */}
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
                  {segs.map((s, j) => {
                    if (s.kind === 'br') {
                      return <br key={j} />;
                    }
                    if (s.kind === 'b') {
                      // use highlight instead of bold to prevent letter-gaps
                      return (
                        <span key={j} style={highlightStyle}>
                          {s.text}
                        </span>
                      );
                    }
                    if (s.kind === 'i') {
                      return (
                        <span key={j} style={{ fontStyle: 'italic' }}>
                          {s.text}
                        </span>
                      );
                    }
                    return <span key={j}>{s.text}</span>;
                  })}
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
