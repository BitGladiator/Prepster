'use client'
import { cn } from '@/lib/utils';
import Image from 'next/image'
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useRef, useCallback } from 'react'

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
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isRecognitionSupported, setIsRecognitionSupported] = useState(false);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const speechSupport = 'speechSynthesis' in window;
    const recognitionSupport = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    setIsSpeechSupported(speechSupport);
    setIsRecognitionSupported(recognitionSupport);
    if (!speechSupport || !recognitionSupport) {
      setDebugInfo('Browser not fully supported. Use Chrome, Edge, or Safari.');
    } else {
      setDebugInfo('Browser supported');
    }
  }, []);

  useEffect(() => {
    if (!isSpeechSupported) return;
    let mounted = true;
    const loadVoices = () => {
      if (!mounted) return;
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const englishVoice = voices.find(v => v.lang.includes('en')) || voices[0];
          selectedVoiceRef.current = englishVoice || null;
          setVoicesLoaded(true);
        } else {
          setTimeout(loadVoices, 500);
        }
      } catch (error) {
      }
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      mounted = false;
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isSpeechSupported]);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;
      setHasMicrophonePermission(true);
      setDebugInfo('Microphone permission granted');
      return true;
    } catch (error) {
      setDebugInfo('Microphone access required.');
      setHasMicrophonePermission(false);
      return false;
    }
  }, []);

  const initializeRecognition = useCallback(() => {
    if (!isRecognitionSupported) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setDebugInfo('Listening');
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
      }
      recognitionTimeoutRef.current = setTimeout(() => {
        recognition.stop();
      }, 15000);
    };
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
          recognitionTimeoutRef.current = null;
        }
        recognition.stop();
        handleUserResponse(finalTranscript);
      }
    };
    recognition.onerror = () => {
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      isListeningRef.current = false;
      setIsListening(false);
    };
    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
    };
  }, [isRecognitionSupported]);

  useEffect(() => {
    initializeRecognition();
    return () => {
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [initializeRecognition]);

  const speakText = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!isSpeechSupported || !selectedVoiceRef.current) {
        resolve();
        return;
      }
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = selectedVoiceRef.current;
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        currentUtteranceRef.current = utterance;
        utterance.onstart = () => {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          setDebugInfo('AI is speaking');
        };
        utterance.onend = () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          currentUtteranceRef.current = null;
          resolve();
        };
        utterance.onerror = () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          currentUtteranceRef.current = null;
          resolve();
        };
        speechSynthesis.speak(utterance);
      }, 200);
    });
  }, [isSpeechSupported]);

  const stopSpeech = useCallback(() => {
    if (isSpeechSupported && speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    currentUtteranceRef.current = null;
  }, [isSpeechSupported]);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) return;
    if (isListeningRef.current) return;
    if (isSpeakingRef.current) return;
    if (callStatus !== CallStatus.ACTIVE) return;
    if (isProcessingRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {}
  }, [callStatus]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const handleUserResponse = async (transcript: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    stopListening();
    setDebugInfo('Processing your answer');
    const userMessage: SavedMessage = {
      role: 'user',
      content: transcript
    };
    setMessages(prev => [...prev, userMessage]);
    try {
      const response = await fetch('/api/interview/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: transcript,
          question: questions?.[currentQuestionIndex] || '',
          conversationHistory: messages,
        }),
      });
      let aiResponse = '';
      if (response.ok) {
        const data = await response.json();
        aiResponse = data.response;
      } else {
        aiResponse = "Thank you for your answer. Let's move to the next question.";
      }
      const assistantMessage: SavedMessage = {
        role: 'assistant',
        content: aiResponse
      };
      setMessages(prev => [...prev, assistantMessage]);
      await speakText(aiResponse);
      if (currentQuestionIndex < (questions?.length || 0) - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        isProcessingRef.current = false;
        await askNextQuestion();
      } else {
        await speakText("Thank you for completing the interview. Have a great day.");
        handleDisconnect();
      }
    } catch {
      if (currentQuestionIndex < (questions?.length || 0) - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        isProcessingRef.current = false;
        askNextQuestion();
      } else {
        handleDisconnect();
      }
    }
  };

  const askNextQuestion = async () => {
    if (!questions || currentQuestionIndex >= questions.length) {
      handleDisconnect();
      return;
    }
    const question = questions[currentQuestionIndex];
    const questionMessage: SavedMessage = {
      role: 'assistant',
      content: question
    };
    setMessages(prev => [...prev, questionMessage]);
    setDebugInfo(`Question ${currentQuestionIndex + 1}/${questions.length}`);
    await speakText(question);
    startListening();
  };

  const handleCall = async () => {
    if (!questions || questions.length === 0) {
      alert('No questions available');
      return;
    }
    if (!voicesLoaded) {
      alert('Please wait for voices to load');
      return;
    }
    setCallStatus(CallStatus.CONNECTING);
    stopSpeech();
    stopListening();
    setMessages([]);
    setCurrentQuestionIndex(0);
    isProcessingRef.current = false;
    setDebugInfo('Setting up interview');
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert('Microphone access is required.');
      setCallStatus(CallStatus.INACTIVE);
      return;
    }
    if (!recognitionRef.current) {
      initializeRecognition();
    }
    setCallStatus(CallStatus.ACTIVE);
    const greeting = `Hello ${userName}. I will ask you ${questions.length} questions. Let's begin.`;
    setMessages([{ role: 'assistant', content: greeting }]);
    await speakText(greeting);
    await askNextQuestion();
  };

  const handleDisconnect = () => {
    stopSpeech();
    stopListening();
    isProcessingRef.current = false;
    setCallStatus(CallStatus.FINISHED);
    setDebugInfo('Interview complete');
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setTimeout(() => router.push('/'), 2000);
  };

  const latestMessage = messages[messages.length - 1]?.content;

  return (
    <>
      <div className='call-view'>
        <div className="card-interviewer">
          <div className="avatar">
            <Image src="/ai-avatar.jpg" alt='interviewer' width={65} height={54} className='object-cover' />
            {isSpeaking && <span className='animate-speak' />}
          </div>
          <h3>AI Interviewer</h3>
          {isSpeaking && (
            <p className="text-sm text-primary-200 mt-2 animate-pulse">Speaking</p>
          )}
          {isListening && (
            <p className="text-sm text-success-100 mt-2 animate-pulse">Listening</p>
          )}
        </div>

        <div className="card-border">
          <div className="card-content">
            <Image src='/user-avatar.jpg' alt='user' width={540} height={540} className='rounded-full object-cover size-[120px]' />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {latestMessage && (
        <div className='transcript-border'>
          <div className="transcript">
            <p className='animate-fadeIn'>{latestMessage}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 mt-8">
        <button
          onClick={handleCall}
          disabled={callStatus === CallStatus.ACTIVE || callStatus === CallStatus.CONNECTING}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {callStatus === CallStatus.ACTIVE ? 'Interview in Progress' : 
           callStatus === CallStatus.CONNECTING ? 'Connecting...' : 
           'Start Interview'}
        </button>
        
        <button
          onClick={handleDisconnect}
          disabled={callStatus !== CallStatus.ACTIVE}
          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          End Interview
        </button>
        
        <div className="text-sm text-gray-600 mt-2">
          {debugInfo}
        </div>
      </div>
    </>
  );
};

export default VoiceInterviewManager;