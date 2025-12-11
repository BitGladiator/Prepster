'use client'
import VoiceInterviewManager from './VoiceInterviewManager';

const Agent = ({ userName, userId, type, questions }: AgentProps) => {
  return (
    <VoiceInterviewManager 
      userName={userName} 
      userId={userId} 
      type={type}
      questions={questions}
    />
  );
};

export default Agent;