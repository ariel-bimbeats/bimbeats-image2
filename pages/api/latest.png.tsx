import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' }; // run at Vercel's edge

export default async function handler() {
  // 1 ─ fetch your bullets from WordPress
  const src = process.env.BULLET_SRC!;
  const res = await fetch(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });

  if (!res.ok) return new Response('Feed error', { status: 500 });

  const { bullets } = (await res.json()) as { bullets: string[] };

  // 2 ─ return an image
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 628,
          background: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
          padding: 60,
          color: '#00b3b3',
          fontSize: 44,
          lineHeight: 1.35,
          display: 'flex',
          flexDirection: 'column',
          gap: 24
        }}
      >
        {bullets.map((t) => (
          <div key={t} style={{ display: 'flex', gap: 18 }}>
            <span style={{ fontSize: 54, lineHeight: 1 }}>•</span>
            <span style={{ flex: 1 }}>{t}</span>
          </div>
        ))}
      </div>
    ),
    {
      width: 1200,
      height: 628,
      headers: { 'Cache-Control': 'no-store' } // never cache
    }
  );
}
