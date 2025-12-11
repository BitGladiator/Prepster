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
  userId: string;
  type: 'generate' | 'interview';
  questions?: string[];
}

const VoiceInterviewManager = ({ userName, userId, type, questions }: VoiceInterviewManagerProps) => {
  const router = useRouter();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        handleUserResponse(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        if (callStatus === CallStatus.ACTIVE) {
          recognitionRef.current.start();
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, [callStatus]);

  useEffect(() => {
    if (callStatus === CallStatus.FINISHED) {
      router.push('/');
    }
  }, [callStatus, router]);

  const speak = (text: string) => {
    return new Promise<void>((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Get available voices and prefer English ones
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => voice.lang.startsWith('en-')) || voices[0];
        if (englishVoice) {
          utterance.voice = englishVoice;
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };

        utterance.onerror = (error) => {
          console.error('Speech synthesis error:', error);
          setIsSpeaking(false);
          resolve();
        };

        synthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        resolve();
      }
    });
  };

  const handleUserResponse = async (transcript: string) => {
    const userMessage: SavedMessage = {
      role: 'user',
      content: transcript
    };
    setMessages(prev => [...prev, userMessage]);

    // Stop listening while AI responds
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);

    // Get AI response
    await getAIResponse(transcript);

    // Move to next question or end interview
    if (currentQuestionIndex < (questions?.length || 5) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeout(() => {
        askNextQuestion();
      }, 1000);
    } else {
      await speak("Thank you for your time today. The interview is now complete. We'll be in touch soon with feedback.");
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
      await speak(data.response);
    } catch (error) {
      console.error('Error getting AI response:', error);
      const fallbackMessage: SavedMessage = {
        role: 'assistant',
        content: "I see. Could you elaborate on that?"
      };
      setMessages(prev => [...prev, fallbackMessage]);
      await speak(fallbackMessage.content);
    }
  };

  const askNextQuestion = async () => {
    if (!questions || currentQuestionIndex >= questions.length) return;

    const question = questions[currentQuestionIndex];
    const questionMessage: SavedMessage = {
      role: 'assistant',
      content: question
    };

    setMessages(prev => [...prev, questionMessage]);
    await speak(question);

    // Start listening for user response
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    // Load voices if not loaded
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    setTimeout(async () => {
      setCallStatus(CallStatus.ACTIVE);

      // Start with greeting
      const greeting = `Hello ${userName}! Thank you for taking the time to speak with me today. I'm excited to learn more about you and your experience. Let's begin with the first question.`;
      const greetingMessage: SavedMessage = {
        role: 'assistant',
        content: greeting
      };
      setMessages([greetingMessage]);
      
      await speak(greeting);
      
      // Ask first question after greeting
      setTimeout(() => {
        askNextQuestion();
      }, 1000);
    }, 1500);
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    window.speechSynthesis.cancel();
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
            <p className="text-sm text-primary-200 mt-2">Listening...</p>
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

      <div className="w-full flex justify-center">
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
          <button className='btn-disconnect' onClick={handleDisconnect}>
            End Interview
          </button>
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