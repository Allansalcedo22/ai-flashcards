import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { mode, title, cards, questions, summary } = await req.json();

    const saveTitle = title?.trim() || 'Untitled Study Set';

    // 1. SAVE FLASHCARDS
    if (mode === 'flashcards' || cards) {
      const { data: deck, error: deckError } = await supabase
        .from('flashcard_decks')
        .insert({ title: saveTitle })
        .select()
        .single();

      if (deckError) throw deckError;

      const formattedCards = cards.map((c: any) => ({
        deck_id: deck.id,
        front: c.front,
        back: c.back,
        hint: c.hint || null,
      }));

      const { error: cardsError } = await supabase
        .from('flashcards')
        .insert(formattedCards);

      if (cardsError) throw cardsError;

      return NextResponse.json({ success: true, id: deck.id });
    }

    // 2. SAVE PRACTICE QUIZ
    if (mode === 'quiz' || questions) {
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({ title: saveTitle })
        .select()
        .single();

      if (quizError) throw quizError;

      const formattedQuestions = questions.map((q: any) => ({
        quiz_id: quiz.id,
        question: q.question,
        options: q.options,
        correct_answer_index: q.correctAnswerIndex ?? q.correct_answer_index,
        explanation: q.explanation || null,
      }));

      const { error: qError } = await supabase
        .from('quiz_questions')
        .insert(formattedQuestions);

      if (qError) throw qError;

      return NextResponse.json({ success: true, id: quiz.id });
    }

    // 3. SAVE SUMMARY
    if (mode === 'summary' || summary) {
      const { data: savedSummary, error: summaryError } = await supabase
        .from('summaries')
        .insert({
          title: saveTitle,
          overview: summary.overview,
          key_takeaways: summary.keyTakeaways || [],
          key_terms: summary.keyTerms || [],
        })
        .select()
        .single();

      if (summaryError) throw summaryError;

      return NextResponse.json({ success: true, id: savedSummary.id });
    }

    return NextResponse.json({ error: 'Invalid study mode or data.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error saving to Supabase:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save to database.' },
      { status: 500 }
    );
  }
}