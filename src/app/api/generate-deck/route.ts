import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { title, text, mode = 'flashcards', questionCount = 10 } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Source text is required.' }, { status: 400 });
    }

    let systemPrompt = '';

    if (mode === 'quiz') {
      const numQuestions = Number(questionCount) === 25 ? 25 : 10;

      systemPrompt = `You are an expert exam builder. Create a practice quiz with EXACTLY ${numQuestions} multiple-choice questions based on the provided material. Return ONLY a JSON object with this exact structure:
      {
        "quizTitle": "Title of the quiz",
        "questions": [
          {
            "id": 1,
            "question": "Clear question text?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswerIndex": 0,
            "explanation": "Why Option A is correct."
          }
        ]
      }`;
    } else if (mode === 'summary') {
      systemPrompt = `You are an expert academic summarizer. Summarize the provided material into clean study notes. Return ONLY a JSON object with this exact structure:
      {
        "overview": "A concise 2-3 sentence overview of the topic.",
        "keyTakeaways": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
        "keyTerms": [
          { "term": "Term Name", "definition": "Clear definition" }
        ]
      }`;
    } else {
      // Default: Flashcards Mode
      systemPrompt = `You are an expert educator. Create concise study flashcards from the provided material. Return ONLY a JSON object with this exact structure:
      {
        "title": "Generated Deck Title",
        "cards": [
          { "front": "Question/Concept", "back": "Answer/Explanation", "hint": "Short hint" }
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