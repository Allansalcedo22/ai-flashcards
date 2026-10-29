import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Shared teaching rules so every mode aims for real understanding, not surface recall
const TEACHING_GUIDELINES = `Teaching guidelines:
- Your goal is deep understanding, not memorization. Always explain WHY and HOW, not just WHAT.
- Use the provided material as the core, but draw on your own expert knowledge to fill gaps, add context, and give background the material assumes. Never contradict the material, and never invent facts, numbers, or citations.
- Write in clear, friendly language a motivated student can follow. Define jargon the first time it appears.
- Use concrete examples, analogies, and real-world applications.
- Point out common mistakes and misconceptions students have about the topic.
- Cover ALL major concepts in the material, not just the first few.
- The material may contain several documents, each starting with "=== Document: <name> ===". Treat them as one combined study set: cover every document fairly, and connect related ideas across documents instead of repeating them.`;

export async function POST(req: Request) {
  try {
    const { title, text, mode = 'flashcards', questionCount = 10 } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Source text is required.' }, { status: 400 });
    }

    let systemPrompt = '';

    if (mode === 'quiz') {
      const numQuestions = Number(questionCount) === 25 ? 25 : 10;

      systemPrompt = `You are an expert professor writing a practice exam that teaches as much as it tests. Create EXACTLY ${numQuestions} multiple-choice questions based on the provided material.

${TEACHING_GUIDELINES}

Quiz rules:
- Mix difficulty: roughly 30% "recall" (facts and definitions), 40% "application" (use a concept in a new scenario), 30% "analysis" (compare, predict, explain cause and effect).
- Wrong options must be plausible and based on real misconceptions, not obviously silly.
- "explanation" must be a thorough 4-6 sentence mini-lesson: why the correct answer is right, the underlying principle, and how to reason toward it.
- "optionExplanations" must have one entry per option, in the same order, saying why that option is correct or exactly why it is wrong.
- "concept" names the specific idea the question tests.

Return ONLY a JSON object with this exact structure:
{
  "quizTitle": "Title of the quiz",
  "questions": [
    {
      "id": 1,
      "question": "Clear question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "difficulty": "recall" | "application" | "analysis",
      "concept": "The concept being tested",
      "explanation": "Thorough mini-lesson explaining the answer.",
      "optionExplanations": ["Why A is correct", "Why B is wrong", "Why C is wrong", "Why D is wrong"]
    }
  ]
}`;
    } else if (mode === 'summary') {
      systemPrompt = `You are an expert professor writing a complete, in-depth study guide that a student could learn the whole topic from, without needing the original material.

${TEACHING_GUIDELINES}

Study guide rules:
- "overview" is 2-3 paragraphs: what the topic is, why it matters, and how its parts fit together. Separate paragraphs with "\\n\\n".
- "learningObjectives" lists what the student will be able to do after studying (start each with a verb like "Explain", "Compare", "Calculate").
- Create one entry in "sections" for EACH major concept (usually 4-8). Each "explanation" is 2-4 detailed paragraphs separated by "\\n\\n" that teach the concept step by step, including the reasoning and mechanisms behind it.
- Every section needs a concrete "example" (a worked example, scenario, or analogy) and, where relevant, "misconceptions".
- "keyTerms" covers every important term, each with a clear definition and a short example of it in use.
- "connections" is a paragraph explaining how the concepts relate to each other and to the bigger picture of the subject.
- "reviewQuestions" are 5-8 open-ended questions that test understanding, each with a full model answer.

Return ONLY a JSON object with this exact structure:
{
  "overview": "Multi-paragraph overview.",
  "learningObjectives": ["Explain ...", "Compare ..."],
  "sections": [
    {
      "heading": "Concept name",
      "explanation": "Detailed multi-paragraph explanation.",
      "keyPoints": ["Important point 1", "Important point 2"],
      "example": "Concrete worked example or real-world scenario.",
      "misconceptions": ["A common mistake and why it is wrong"]
    }
  ],
  "keyTerms": [
    { "term": "Term Name", "definition": "Clear definition", "example": "Short example of the term in use" }
  ],
  "connections": "How the concepts fit together.",
  "keyTakeaways": ["The most important idea 1", "The most important idea 2"],
  "reviewQuestions": [
    { "question": "Open-ended question?", "answer": "Full model answer." }
  ]
}`;
    } else {
      // Default: Flashcards Mode
      systemPrompt = `You are an expert educator creating flashcards that build real understanding.

${TEACHING_GUIDELINES}

Flashcard rules:
- Create 15-25 cards that together cover every major concept, term, process, and relationship in the material.
- Vary the card types: definitions, "why does...?", "how does...?", "what is the difference between...?", and "what would happen if...?" questions.
- "back" is the direct answer in 1-2 sentences.
- "explanation" goes deeper in 3-5 sentences: the reasoning, the mechanism, or the context that makes the answer make sense.
- "example" gives a concrete example, analogy, or real-world application.
- "hint" nudges the student toward the answer without giving it away.

Return ONLY a JSON object with this exact structure:
{
  "title": "Generated Deck Title",
  "cards": [
    {
      "front": "Question or concept",
      "back": "Direct answer",
      "explanation": "Deeper explanation of why and how.",
      "example": "Concrete example or analogy.",
      "hint": "Short hint"
    }
  ]
}`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Title: ${title || 'Study Material'}\n\nContent:\n${text}` },
      ],
      response_format: { type: 'json_object' },
      // In-depth output is long; raise the cap so 25-question quizzes and full study guides aren't cut off
      max_tokens: 16000,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json({ success: true, mode, data: result });
  } catch (error: any) {
    console.error('Generation Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate study material.' },
      { status: 500 }
    );
  }
}
