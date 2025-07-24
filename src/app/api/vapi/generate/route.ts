import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRandomInterviewCover } from "@/lib/utils";
import { db } from "../../../../../firebase/admin";

export async function POST(request: Request) {
  
  const authHeader = request.headers.get("authorization");
  const expectedToken = "vapi-secret-123456789"; 

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  
  const { type, role, level, techstack, amount, userid } = await request.json();

  try {
    
    const { text: questions } = await generateText({
      model: google("gemini-2.0-flash-001"),
      prompt: `Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
      `,
    });

    const parsedQuestions = JSON.parse(questions);

    
    const interview = {
      role,
      type,
      level,
      techstack: techstack.split(","),
      questions: parsedQuestions,
      userid,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };
    await db.collection("interviews").add(interview);

    
    return Response.json(
      {
        success: true,
        message: parsedQuestions.join(" "), 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error generating interview:", error);
    return Response.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}


export async function GET() {
  return Response.json({ success: true, data: "Thank you!" }, { status: 200 });
}
