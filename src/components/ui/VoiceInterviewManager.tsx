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
  const [debugInfo, setDebugInfo] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // SIMPLIFIED: Direct speech function
  const speakText = async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        console.error('Speech synthesis not supported');
        reject('Speech synthesis not supported');
        return;
      }

      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Clear any existing utterance
      if (currentUtteranceRef.current) {
        currentUtteranceRef.current.onend = null;
        currentUtteranceRef.current.onerror = null;
        currentUtteranceRef.current = null;
      }

      // Create new utterance
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;

      // Get voices
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Prefer a female voice if available, else default
        const voice = voices.find(v => v.name.includes('Female')) || 
                     voices.find(v => v.default) || 
                     voices[0];
        utterance.voice = voice;
      }

      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        console.log('Speech started:', text.substring(0, 30) + '...');
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        setDebugInfo(`Speaking: "${text.substring(0, 30)}..."`);
      };

      utterance.onend = () => {
        console.log('Speech ended successfully');
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('Speech error:', event.error);
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        
        if (event.error === 'canceled') {
          console.log('Speech was cancelled, continuing...');
          resolve(); // Resolve anyway to continue flow
        } else {
          reject(event.error);
        }
      };

      // IMPORTANT: Add a small delay to ensure clean state
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.error('Error starting speech:', error);
          reject(error);
        }
      }, 100);
    });
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current = null;
    }
  };

  useEffect(() => {
    // Initialize Speech Recognition
    const initSpeechRecognition = () => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
          setDebugInfo('Listening for answer...');
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          console.log('User said:', transcript);
          setIsListening(false);
          setDebugInfo(`User: "${transcript.substring(0, 30)}..."`);
          handleUserResponse(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setDebugInfo(`Recognition error: ${event.error}`);
          
          // Auto-restart on non-fatal errors
          if (['no-speech', 'audio-capture', 'network'].includes(event.error)) {
            setTimeout(() => {
              if (callStatus === CallStatus.ACTIVE && !isSpeakingRef.current) {
                startListening();
              }
            }, 2000);
          }
        };

        recognition.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
          
          // Auto-restart if we should be listening
          if (callStatus === CallStatus.ACTIVE && !isSpeakingRef.current) {
            setTimeout(() => {
              startListening();
            }, 1000);
          }
        };

        recognitionRef.current = recognition;
      }
    };

    // Initialize voices
    const initVoices = () => {
      if ('speechSynthesis' in window) {
        // Force voices to load
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
            console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
            window.speechSynthesis.onvoiceschanged = null;
          };
        } else {
          console.log('Voices already loaded:', voices.length);
        }
      }
    };

    initVoices();
    initSpeechRecognition();

    return () => {
      stopSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Error stopping recognition during cleanup:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (callStatus === CallStatus.FINISHED) {
      setTimeout(() => router.push('/'), 1000);
    }
  }, [callStatus, router]);

  const startListening = () => {
    if (!recognitionRef.current || isListening || isSpeakingRef.current || callStatus !== CallStatus.ACTIVE) {
      console.log('Cannot start listening:', {
        hasRecognition: !!recognitionRef.current,
        isListening,
        isSpeaking: isSpeakingRef.current,
        callStatus
      });
      return;
    }
    
    try {
      recognitionRef.current.stop();
      setTimeout(() => {
        try {
          recognitionRef.current.start();
          console.log('Started listening');
          setDebugInfo('Started listening...');
        } catch (startError) {
          console.error('Failed to start listening:', startError);
          setDebugInfo(`Failed to start listening: ${startError}`);
        }
      }, 200);
    } catch (stopError) {
      console.error('Error in startListening:', stopError);
      // Try starting anyway
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Error stopping recognition:', e);
      }
    }
    setIsListening(false);
  };

  const handleUserResponse = async (transcript: string) => {
    const userMessage: SavedMessage = {
      role: 'user',
      content: transcript
    };
    setMessages(prev => [...prev, userMessage]);

    stopListening();

    // Get AI response
    await getAIResponse(transcript);

    // Move to next question or end interview
    if (currentQuestionIndex < (questions?.length || 5) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeout(() => {
        askNextQuestion();
      }, 1000);
    } else {
      // End of interview
      await speakText("Thank you for your time. The interview is now complete.");
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

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: SavedMessage = {
        role: 'assistant',
        content: data.response
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Speak the response
      await speakText(data.response);
      
      // If this was a question, start listening for answer
      if (currentQuestionIndex < (questions?.length || 5)) {
        setTimeout(() => {
          startListening();
        }, 500);
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      const fallbackMessage: SavedMessage = {
        role: 'assistant',
        content: "Thank you for sharing that. Let's move on to the next question."
      };
      setMessages(prev => [...prev, fallbackMessage]);
      await speakText(fallbackMessage.content);
      
      // Move to next question on error
      if (currentQuestionIndex < (questions?.length || 5) - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setTimeout(() => {
          askNextQuestion();
        }, 1000);
      }
    }
  };

  const askNextQuestion = async () => {
    console.log('askNextQuestion called, index:', currentQuestionIndex);
    
    if (!questions || questions.length === 0) {
      console.error('No questions available!');
      await speakText("No questions were loaded. Please contact support.");
      return;
    }

    if (currentQuestionIndex >= questions.length) {
      console.log('All questions completed');
      await speakText("That's all the questions. Thank you for your time.");
      setTimeout(() => handleDisconnect(), 2000);
      return;
    }

    const question = questions[currentQuestionIndex];
    console.log(`Asking question ${currentQuestionIndex + 1}:`, question);
    
    const questionMessage: SavedMessage = {
      role: 'assistant',
      content: question
    };

    setMessages(prev => [...prev, questionMessage]);
    setDebugInfo(`Asking question ${currentQuestionIndex + 1}`);
    
    // Stop any ongoing speech/listening
    stopSpeech();
    stopListening();
    
    // Speak the question
    try {
      await speakText(question);
      
      // Start listening for answer after speaking
      console.log('Question spoken, starting to listen...');
      setTimeout(() => {
        startListening();
      }, 800);
    } catch (error) {
      console.error('Failed to speak question:', error);
      // Even if speech fails, start listening
      setTimeout(() => {
        startListening();
      }, 800);
    }
  };

  const handleCall = async () => {
    console.log('Starting interview with questions:', questions);
    
    if (!questions || questions.length === 0) {
      alert('No interview questions available. Please generate questions first.');
      return;
    }

    setCallStatus(CallStatus.CONNECTING);
    stopSpeech();
    stopListening();
    
    // Reset state
    setMessages([]);
    setCurrentQuestionIndex(0);
    setDebugInfo('Initializing...');

    // Check for speech support
    if (!('speechSynthesis' in window)) {
      alert('Your browser does not support text-to-speech. Please use Chrome, Edge, or Safari.');
      setCallStatus(CallStatus.INACTIVE);
      return;
    }

    // Ensure voices are loaded
    await new Promise<void>((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Voices available:', voices.map(v => v.name));
        resolve();
      } else {
        console.log('Waiting for voices to load...');
        window.speechSynthesis.onvoiceschanged = () => {
          console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
          window.speechSynthesis.onvoiceschanged = null;
          resolve();
        };
        // Fallback timeout
        setTimeout(resolve, 2000);
      }
    });

    setCallStatus(CallStatus.ACTIVE);
    setDebugInfo('Interview started');

    // Start with greeting
    const greeting = `Hello ${userName}! Let's begin your interview.`;
    const greetingMessage: SavedMessage = {
      role: 'assistant',
      content: greeting
    };
    setMessages([greetingMessage]);

    try {
      await speakText(greeting);
      
      // Ask first question after greeting
      console.log('Greeting complete, asking first question...');
      setTimeout(() => {
        askNextQuestion();
      }, 1000);
    } catch (error) {
      console.error('Failed to speak greeting:', error);
      // Even if greeting fails, try to ask first question
      setTimeout(() => {
        askNextQuestion();
      }, 1000);
    }
  };

  const handleDisconnect = () => {
    console.log('Disconnecting...');
    stopSpeech();
    stopListening();
    setCallStatus(CallStatus.FINISHED);
    setDebugInfo('Interview completed');
  };

  const handleDebugTestSpeech = () => {
    console.log('Testing speech...');
    speakText("This is a test message to check if speech is working.");
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
              <div className="mt-2">
                <p className="text-sm text-light-100">
                  Question {currentQuestionIndex + 1} of {questions?.length || 5}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {isSpeaking ? '🔊 Speaking...' : isListening ? '🎤 Listening...' : '✅ Ready'}
                </p>
              </div>
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

      <div className="w-full flex justify-center gap-4 flex-wrap">
        {callStatus !== CallStatus.ACTIVE ? (
          <button
            className='relative btn-call'
            onClick={handleCall}
            disabled={callStatus === CallStatus.CONNECTING}
          >
            <span
              className={cn('absolute animate-ping rounded-full opacity-75', callStatus !== CallStatus.CONNECTING && 'hidden')}
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
            <button 
              className='btn-secondary bg-blue-500 text-xs' 
              onClick={handleDebugTestSpeech}
            >
              Test Speech
            </button>
          </>
        )}
      </div>

      {/* Debug info */}
      <div className="w-full text-center mt-4">
        <div className="inline-block bg-gray-800 text-gray-100 text-xs p-3 rounded-lg">
          <p>Status: {callStatus}</p>
          <p>Speaking: {isSpeaking.toString()} | Listening: {isListening.toString()}</p>
          <p>Question: {currentQuestionIndex + 1}/{questions?.length || 0}</p>
          <p className="text-yellow-300">{debugInfo}</p>
        </div>
      </div>

      {!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && (
        <div className="w-full text-center mt-4">
          <p className="text-destructive-100">
            Your browser doesn't support speech recognition. Please use Chrome, Edge, or Safari.
          </p>
        </div>
      )}

      {!('speechSynthesis' in window) && (
        <div className="w-full text-center mt-4">
          <p className="text-destructive-100">
            Your browser doesn't support text-to-speech. Please use Chrome, Edge, or Safari.
          </p>
        </div>
      )}
    </>
  );
};

export default VoiceInterviewManager;