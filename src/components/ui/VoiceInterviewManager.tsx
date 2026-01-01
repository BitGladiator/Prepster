'use client'
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

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

const VoiceInterviewManager = ({ userName, userId = '', type, questions = [] }: VoiceInterviewManagerProps) => {
  const router = useRouter();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [debugInfo, setDebugInfo] = useState('Ready to start');

  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Speak text using browser TTS
  const speak = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang.includes('en')) || voices[0];
        if (englishVoice) utterance.voice = englishVoice;
        
        utterance.onstart = () => {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
        };
        
        utterance.onend = () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          resolve();
        };
        
        utterance.onerror = () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } else {
        resolve();
      }
    });
  };

  // Initialize Deepgram WebSocket
  const initializeWebSocket = async () => {
    try {
      setDebugInfo('Connecting to Deepgram...');
      
      const tokenResponse = await fetch('/api/deepgram/token', {
        method: 'POST',
      });
      
      if (!tokenResponse.ok) {
        throw new Error('Failed to get Deepgram credentials');
      }

      const { apiKey } = await tokenResponse.json();
      
      if (!apiKey) {
        throw new Error('No API key received');
      }

      // Create WebSocket connection to Deepgram
      // Use wss://api.deepgram.com/v1/listen for live transcription
      const wsUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&model=general`;
      const ws = new WebSocket(wsUrl, ['token', apiKey]);

      ws.onopen = () => {
        console.log('Deepgram WebSocket connected');
        setDebugInfo('Connected to speech service');
        startAudioStream(ws);
      };

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          
          if (data.type === 'Results') {
            const transcriptText = data.channel?.alternatives?.[0]?.transcript;
            
            if (transcriptText && transcriptText.trim()) {
              if (data.is_final) {
                console.log('Final transcript:', transcriptText);
                setTranscript('');
                if (!isProcessingRef.current) {
                  handleUserResponse(transcriptText);
                }
              } else {
                // Interim result
                setTranscript(transcriptText);
              }
            }
          }
        } catch (error) {
          console.error('Error parsing Deepgram message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
        setDebugInfo('Connection error');
      };

      ws.onclose = () => {
        console.log('Deepgram WebSocket closed');
        setDebugInfo('Connection closed');
        setIsListening(false);
      };

      websocketRef.current = ws;
      
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
      setDebugInfo('Failed to connect to speech service');
    }
  };

  // Start audio stream and send to Deepgram
  const startAudioStream = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      mediaStreamRef.current = stream;
      
      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array for Deepgram
          const int16Array = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Send raw PCM data to Deepgram
          ws.send(int16Array.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      setDebugInfo('Listening...');
      
      // Store processor for cleanup
      (processor as any)._source = source;
      (processor as any)._audioContext = audioContext;
      
    } catch (error) {
      console.error('Error starting audio stream:', error);
      setDebugInfo('Microphone access denied');
    }
  };

  // Stop audio stream
  const stopAudioStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsListening(false);
    setTranscript('');
  };

  // Handle user response
  const handleUserResponse = async (userTranscript: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    stopAudioStream();
    setDebugInfo('Processing your answer...');

    const userMessage: SavedMessage = {
      role: 'user',
      content: userTranscript
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/interview/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: userTranscript,
          question: questions[currentQuestionIndex] || '',
          conversationHistory: messages,
        }),
      });

      let aiResponse = "Thank you for your answer. Let's move to the next question.";
      if (response.ok) {
        const data = await response.json();
        aiResponse = data.response;
      }

      const assistantMessage: SavedMessage = {
        role: 'assistant',
        content: aiResponse
      };
      setMessages(prev => [...prev, assistantMessage]);

      await speak(aiResponse);

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        isProcessingRef.current = false;
        await askNextQuestion(currentQuestionIndex + 1);
      } else {
        await speak("Thank you for completing the interview. Have a great day!");
        handleDisconnect();
      }
    } catch (error) {
      console.error('Error processing response:', error);
      isProcessingRef.current = false;
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        askNextQuestion(currentQuestionIndex + 1);
      } else {
        handleDisconnect();
      }
    }
  };

  // Ask next question
  const askNextQuestion = async (questionIndex: number) => {
    if (!questions || questionIndex >= questions.length) {
      handleDisconnect();
      return;
    }

    const question = questions[questionIndex];
    const questionMessage: SavedMessage = {
      role: 'assistant',
      content: question
    };
    setMessages(prev => [...prev, questionMessage]);
    setDebugInfo(`Question ${questionIndex + 1}/${questions.length}`);

    await speak(question);
    
    // Reinitialize WebSocket for next question
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      startAudioStream(websocketRef.current);
    } else {
      await initializeWebSocket();
    }
  };

  // Start interview
  const handleCall = async () => {
    if (!questions || questions.length === 0) {
      alert('No questions available');
      return;
    }

    setCallStatus(CallStatus.CONNECTING);
    setMessages([]);
    setCurrentQuestionIndex(0);
    isProcessingRef.current = false;

    await initializeWebSocket();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 1000));

    setCallStatus(CallStatus.ACTIVE);

    const greeting = `Hello ${userName}. I will ask you ${questions.length} questions. Let's begin.`;
    setMessages([{ role: 'assistant', content: greeting }]);
    
    await speak(greeting);
    await askNextQuestion(0);
  };

  // End interview
  const handleDisconnect = () => {
    stopAudioStream();
    
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    isProcessingRef.current = false;
    setCallStatus(CallStatus.FINISHED);
    setDebugInfo('Interview complete');

    setTimeout(() => router.push('/'), 2000);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      handleDisconnect();
    };
  }, []);

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

      {transcript && isListening && (
        <div className='transcript-border mt-4'>
          <div className="transcript">
            <p className='text-blue-300 text-sm'>Transcribing: {transcript}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 mt-8">
        <button
          onClick={handleCall}
          disabled={callStatus === CallStatus.ACTIVE || callStatus === CallStatus.CONNECTING}
          className="btn-call"
        >
          {callStatus === CallStatus.ACTIVE ? 'Interview in Progress' : 
           callStatus === CallStatus.CONNECTING ? 'Connecting...' : 
           'Start Interview'}
        </button>
        
        <button
          onClick={handleDisconnect}
          disabled={callStatus !== CallStatus.ACTIVE}
          className="btn-disconnect"
        >
          End Interview
        </button>
        
        <div className="text-sm text-light-400 mt-2">
          {debugInfo}
        </div>
      </div>
    </>
  );
};

export default VoiceInterviewManager;