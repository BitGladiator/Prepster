import Agent from '@/components/ui/Agent'
import { getCurrentUser } from '@/lib/actions/auth.action'
import React from 'react'

const page = async() => {
  const user = await getCurrentUser();
  
  const sampleQuestions = [
    "Can you tell me about yourself and your background?",
    "What interests you about this role?",
    "Describe a challenging project you worked on and how you handled it.",
    "What are your key technical strengths?",
    "Where do you see yourself in the next few years?"
  ];
  
  return (
   <>
   <h3>Interview Generation</h3>
   <Agent 
     userName={user?.name || 'Candidate'} 
     userId={user?.id} 
     type="generate"
     questions={sampleQuestions}
   />
   </>
  )
}

export default page