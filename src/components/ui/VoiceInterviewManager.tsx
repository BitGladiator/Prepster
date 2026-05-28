"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Vapi from "@vapi-ai/web";
import { interviewer } from "../../../constants";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

interface VoiceInterviewManagerProps {
  userName: string;
  userId?: string;
  type: "generate" | "interview";
  questions?: string[];
}

const VoiceInterviewManager = ({
  userName,
  userId = "",
  type,
  questions = [],
}: VoiceInterviewManagerProps) => {
  const router = useRouter();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [debugInfo, setDebugInfo] = useState("Ready to start");

  const vapiRef = useRef<Vapi | null>(null);


  useEffect(() => {
    let vapiInstance: Vapi | null = null;

    if (typeof window !== "undefined") {
      vapiInstance = new Vapi(process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN || "");
      vapiRef.current = vapiInstance;

      vapiInstance.on("call-start", () => {
        console.log("✅ Vapi call started successfully");
        setCallStatus(CallStatus.ACTIVE);
        setDebugInfo("Connected. Interview in progress...");
      });

      vapiInstance.on("call-end", () => {
        console.log("ℹ️ Vapi call ended");
        setCallStatus(CallStatus.FINISHED);
        setIsListening(false);
        setIsSpeaking(false);
        setTranscript("");
        setDebugInfo("Interview complete");

        
        setTimeout(() => {
          router.push("/");
        }, 2000);
      });

      vapiInstance.on("speech-start", () => {
        setIsSpeaking(true);
        setIsListening(false);
      });

      vapiInstance.on("speech-end", () => {
        setIsSpeaking(false);
        setIsListening(true);
      });

      vapiInstance.on("message", (message: any) => {
        if (message.type === "transcript") {
          if (message.transcriptType === "partial") {
            setTranscript(message.transcript);
          } else if (message.transcriptType === "final") {
            const role = message.role === "user" ? "user" : "assistant";
            setMessages((prev) => [
              ...prev,
              { role, content: message.transcript },
            ]);
            setTranscript("");

          
            if (role === "assistant") {
              const lowerText = message.transcript.toLowerCase();
              if (
                lowerText.includes("thank you for completing the interview") ||
                lowerText.includes("thank you for your time") ||
                lowerText.includes("goodbye")
              ) {
                console.log("Detected end of interview phrase in transcript. Stopping call...");
                vapiRef.current?.stop();
              }
            }
          }
        }
      });

      vapiInstance.on("error", async (err: any) => {
        console.error("Vapi error:", err);
        
        let detail = "";
        try {
          if (err && err.error instanceof Response) {
            detail = await err.error.clone().text();
          } else if (err instanceof Response) {
            detail = await err.clone().text();
          }
        } catch (e) {
          console.error("Could not parse Vapi error response:", e);
        }

        if (detail) {
          console.error("Vapi detailed API error:", detail);
          setDebugInfo(`Call failed: ${detail}`);
        } else {
          setDebugInfo("Call failed. Please try again.");
        }
        setCallStatus(CallStatus.INACTIVE);
      });
    }

    return () => {
      if (vapiInstance) {
        vapiInstance.stop();
      }
    };
  }, [router]);

  
  const handleCall = async () => {
    if (!questions || questions.length === 0) {
      alert("No questions available");
      return;
    }

    if (!vapiRef.current) {
      setDebugInfo("Voice assistant not initialized");
      return;
    }

    setCallStatus(CallStatus.CONNECTING);
    setMessages([]);
    setTranscript("");
    setDebugInfo("Connecting to interviewer...");

    const baseSystemPrompt = interviewer.model?.messages?.[0]?.content || "";
    const formattedQuestions = questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n");
    const systemPrompt = baseSystemPrompt.replace("{{questions}}", formattedQuestions);

    const dynamicInterviewer = {
      ...interviewer,
      model: {
        ...interviewer.model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      },
      endCallPhrases: [
        "thank you for completing the interview",
        "thank you for your time",
        "goodbye"
      ],
      clientMessages: ["transcript"],
    };

    try {
      vapiRef.current.start(dynamicInterviewer as any);
    } catch (err) {
      console.error("Failed to start Vapi call:", err);
      setDebugInfo("Failed to connect");
      setCallStatus(CallStatus.INACTIVE);
    }
  };


  const handleDisconnect = () => {
    console.log("Disconnecting...");
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  };

  const latestMessage = messages[messages.length - 1]?.content;

  return (
    <>
      <div className="call-view">
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.jpg"
              alt="interviewer"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
          {isSpeaking && (
            <p className="text-sm text-primary-200 mt-2 animate-pulse">
              Speaking
            </p>
          )}
          {isListening && (
            <p className="text-sm text-success-100 mt-2 animate-pulse">
              Listening
            </p>
          )}
        </div>

        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.jpg"
              alt="user"
              width={540}
              height={540}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {latestMessage && (
        <div className="transcript-border">
          <div className="transcript">
            <p className="animate-fadeIn">{latestMessage}</p>
          </div>
        </div>
      )}

      {transcript && isListening && (
        <div className="transcript-border mt-4">
          <div className="transcript">
            <p className="text-blue-300 text-sm">Transcribing: {transcript}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 mt-8">
        <button
          onClick={handleCall}
          disabled={
            callStatus === CallStatus.ACTIVE ||
            callStatus === CallStatus.CONNECTING
          }
          className="btn-call"
        >
          {callStatus === CallStatus.ACTIVE
            ? "Interview in Progress"
            : callStatus === CallStatus.CONNECTING
            ? "Connecting..."
            : "Start Interview"}
        </button>

        <button
          onClick={handleDisconnect}
          disabled={callStatus !== CallStatus.ACTIVE}
          className="btn-disconnect"
        >
          End Interview
        </button>

        <div className="text-sm text-light-400 mt-2">{debugInfo}</div>
      </div>
    </>
  );
};

export default VoiceInterviewManager;
