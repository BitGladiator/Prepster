// app/api/deepgram/token/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
      console.error('DEEPGRAM_API_KEY is not set in environment variables');
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    console.log('Providing Deepgram API key for streaming...');
    
    // Return the API key - frontend will use it for WebSocket connection
    return NextResponse.json({ 
      apiKey: apiKey
    });
  } catch (error) {
    console.error('Error in Deepgram token route:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}