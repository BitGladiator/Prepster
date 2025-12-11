'use client'
import { cn } from '@/lib/utils';
import Image from 'next/image'
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useRef } from 'react'

enum CallStatus {
  INACTIVE = 'INACTIVE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED'
}

interface SavedMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

interface VoiceInterviewManagerProps {
  userName: string;
  userId?: string;
  type: 'generate' | 'interview';
  questions?: string[];
}

const VoiceInterviewManager = ({ userName, userId = '', type, questions }: VoiceInterviewManagerProps) => {
  const router = useRouter();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isPlayingRef = useRef(false);

  // FIXED: Reliable chunked speech function
  const speakInChunks = async (text: string) => {
    if (!('speechSynthesis' in window)) {
      console.error('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    isPlayingRef.current = true;
    setIsSpeaking(true);

    // Split into sentences (max ~120 chars each for reliability)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    console.log(`Speaking ${sentences.length} sentences`);

    for (let i = 0; i < sentences.length; i++) {
      if (!isPlayingRef.current) break;

      const sentence = sentences[i].trim();
      if (!sentence) continue;

      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        
        // Use default voice (most reliable)
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.default) || voices[0];
        if (voice) utterance.voice = voice;
        
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => {
          console.log(`Finished sentence ${i + 1}/${sentences.length}`);
          resolve();
        };

        utterance.onerror = (e) => {
          console.error('Speech error:', e.error);
          resolve(); // Continue anyway
        };

        // Small delay between sentences
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 200);
      });

      // Pause between sentences
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
    console.log('Speech complete');
  };

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // Changed to false for better control
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        console.log('User said:', transcript);
        setIsListening(false);
        handleUserResponse(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        console.log('Recognition ended');
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
      isPlayingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (callStatus === CallStatus.FINISHED) {
      router.push('/');
    }
  }, [callStatus, router]);

  const handleUserResponse = async (transcript: string) => {
    const userMessage: SavedMessage = {
      role: 'user',
      content: transcript
    };
    setMessages(prev => [...prev, userMessage]);

    // Get AI response
    await getAIResponse(transcript);

    // Move to next question or end interview
    if (currentQuestionIndex < (questions?.length || 5) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeout(() => {
        askNextQuestion();
      }, 1500);
    } else {
      await speakInChunks("Thank you for your time. The interview is complete.");
      setTimeout(() => {
        handleDisconnect();
      }, 2000);
    }
  };

  const getAIResponse = async (userInput: string) => {
    try {
      const response = await fetch('/api/interview/response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userInput,
          question: questions?.[currentQuestionIndex] || '',
          conversationHistory: messages,
        }),
      });

      const data = await response.json();
      const assistantMessage: SavedMessage = {
        role: 'assistant',
        content: data.response
      };

      setMessages(prev => [...prev, assistantMessage]);
      await speakInChunks(data.response);
    } catch (error) {
      console.error('Error getting AI response:', error);
      const fallbackMessage: SavedMessage = {
        role: 'assistant',
        content: "I see. Could you elaborate on that?"
      };
      setMessages(prev => [...prev, fallbackMessage]);
      await speakInChunks(fallbackMessage.content);
    }
  };

  const askNextQuestion = async () => {
    if (!questions || questions.length === 0) {
      console.error('No questions available!');
      await speakInChunks("No questions were loaded. Please contact support.");
      return;
    }

    if (currentQuestionIndex >= questions.length) {
      console.log('All questions completed');
      return;
    }

    const question = questions[currentQuestionIndex];
    console.log(`Asking question ${currentQuestionIndex + 1}: ${question}`);
    
    const questionMessage: SavedMessage = {
      role: 'assistant',
      content: question
    };

    setMessages(prev => [...prev, questionMessage]);
    await speakInChunks(question);

    // Start listening after speech completes
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (recognitionRef.current && callStatus === CallStatus.ACTIVE) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        console.log('Started listening for response');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  const handleCall = async () => {
    console.log('Starting interview with questions:', questions);
    
    if (!questions || questions.length === 0) {
      alert('No interview questions available. Please generate questions first.');
      return;
    }

    setCallStatus(CallStatus.CONNECTING);

    // Wait for voices to load
    await new Promise<void>((resolve) => {
      if (window.speechSynthesis.getVoices().length > 0) {
        resolve();
      } else {
        window.speechSynthesis.onvoiceschanged = () => resolve();
        setTimeout(resolve, 1000); // Fallback
      }
    });

    setCallStatus(CallStatus.ACTIVE);

    // Short greeting
    const greeting = `Hello ${userName}! Let's begin your interview.`;
    const greetingMessage: SavedMessage = {
      role: 'assistant',
      content: greeting
    };
    setMessages([greetingMessage]);
    
    console.log('Speaking greeting...');
    await speakInChunks(greeting);
    
    // Ask first question after greeting
    console.log('Waiting before first question...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await askNextQuestion();
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
    setIsListening(false);
  };

  const latestMessage = messages[messages.length - 1]?.content;
  const isCallInactiveOrFinished = callStatus === CallStatus.INACTIVE || callStatus === CallStatus.FINISHED;

  return (
    <>
      <div className='call-view'>
        <div className="card-interviewer">
          <div className="avatar">
            <Image src="/ai-avatar.jpg" alt='interviewer' width={65} height={54} className='object-cover' />
            {isSpeaking && <span className='animate-speak' />}
          </div>
          <h3>AI Interviewer</h3>
          {isListening && (
            <p className="text-sm text-success-100 mt-2 animate-pulse">🎤 Listening...</p>
          )}
        </div>
        <div className="card-border">
          <div className="card-content">
            <Image src='/user-avatar.jpg' alt='user' width={540} height={540} className='rounded-full object-cover size-[120px]' />
            <h3>{userName}</h3>
            {callStatus === CallStatus.ACTIVE && (
              <p className="text-sm text-light-100 mt-2">
                Question {currentQuestionIndex + 1} of {questions?.length || 5}
              </p>
            )}
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className='transcript-border'>
          <div className="transcript">
            <p key={latestMessage} className={cn('transition-opacity duration-500 opacity-0', 'animate-fadeIn opacity-100')}>
              {latestMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center gap-4">
        {callStatus !== 'ACTIVE' ? (
          <button
            className='relative btn-call'
            onClick={handleCall}
            disabled={callStatus === CallStatus.CONNECTING}
          >
            <span
              className={cn('absolute animate-ping rounded-full opacity-75', callStatus !== 'CONNECTING' && 'hidden')}
            />
            <span>
              {isCallInactiveOrFinished ? 'Start Interview' : 'Connecting...'}
            </span>
          </button>
        ) : (
          <>
            <button 
              className='btn-secondary' 
              onClick={askNextQuestion}
              disabled={!questions || currentQuestionIndex >= questions.length || isSpeaking}
            >
              {isSpeaking ? 'Speaking...' : 'Next Question'}
            </button>
            <button className='btn-disconnect' onClick={handleDisconnect}>
              End Interview
            </button>
          </>
        )}
      </div>

      {!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && (
        <div className="w-full text-center mt-4">
          <p className="text-destructive-100">
            Your browser doesn't support speech recognition. Please use Chrome, Edge, or Safari.
          </p>
        </div>
      )}
    </>
  );
};

export default VoiceInterviewManager;