import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRandomInterviewCover } from "@/lib/utils";
import { db } from "../../../../../firebase/admin";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers,
  });
}

export async function GET() {
  return new Response(JSON.stringify({ success: true, data: "THANK YOU!" }), {
    status: 200,
    headers,
  });
}

export async function POST(request: Request) {
  try {
    const { type, role, level, techstack, amount, userid: rawUserid } = await request.json();

    const userid = (rawUserid || "").trim(); // Fix for accidental space in userid

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

    const interview = {
      role,
      type,
      level,
      techstack: techstack.split(","),
      questions: JSON.parse(questions),
      userid,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    await db.collection("interviews").add(interview);

    return new Response(
      JSON.stringify({ success: true, message: interview.questions.join(" ") }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Interview generation failed:", error);
    return new Response(JSON.stringify({ success: false, error: "Something went wrong." }), {
      status: 500,
      headers,
    });
  }
}
