import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    const { userInput, question, conversationHistory } = await req.json();
    const context = conversationHistory
      .map((msg: any) => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n');

    const prompt = `You are a professional job interviewer conducting a real-time voice interview.

Current Question: ${question}

Conversation so far:
${context}

Candidate's latest response: ${userInput}

Instructions:
- Acknowledge their response briefly and naturally
- If the response is vague or incomplete, ask a brief follow-up question
- If the response is complete, acknowledge it positively
- Keep your response SHORT (1-3 sentences max) as this is a voice conversation
- Be warm, professional, and conversational
- Don't repeat the question

Provide your brief response:`;

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    return NextResponse.json({ response: response.trim() });
  } catch (error) {
    console.error('Error in interview response:', error);
    

    const fallbacks = [
      "That's interesting. Could you tell me more about that?",
      "I see. Can you elaborate on your approach?",
      "Thank you for sharing. What challenges did you face?",
      "Interesting perspective. How did you handle that situation?"
    ];
    
    const randomFallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    
    return NextResponse.json({ response: randomFallback });
  }
}