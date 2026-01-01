import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    const projectId = process.env.DEEPGRAM_PROJECT_ID;

    if (!apiKey || !projectId) {
      return NextResponse.json(
        { error: 'Missing Deepgram credentials' },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://api.deepgram.com/v1/projects/${projectId}/keys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'browser websocket token',
          scopes: ['usage:write'],
          time_to_live_in_seconds: 300,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('Deepgram error:', text);
      return NextResponse.json(
        { error: 'Deepgram token failed', details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    return NextResponse.json({ token: data.key });
  } catch (err) {
    console.error('Token route crashed:', err);
    return NextResponse.json(
      { error: 'Server crash' },
      { status: 500 }
    );
  }
}
