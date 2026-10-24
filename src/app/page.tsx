'use client';

import React, { useState } from 'react';
import { 
  BookOpen, 
  HelpCircle, 
  FileText, 
  Upload, 
  Sparkles, 
  Save, 
  RotateCw, 
  CheckCircle2, 
  XCircle,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AppMode = 'flashcards' | 'quiz' | 'summary';

interface Flashcard {
  front: string;
  back: string;
  hint?: string;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface SummaryData {
  overview: string;
  keyTakeaways: string[];
  keyTerms: { term: string; definition: string }[];
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>('flashcards');
  const [title, setTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Quiz Settings
  const [questionCount, setQuestionCount] = useState<number>(10);

  // Generated Content State
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState('');
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  // Flashcard Flip & Navigation State
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz User Responses State
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Handle File Upload & Parsing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsParsingFile(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse file.');

      setInputText(data.text);
    } catch (err: any) {
      alert(err.message || 'Error parsing file.');
    } finally {
      setIsParsingFile(false);
    }
  };

  // Handle Study Material Generation
  const handleGenerate = async () => {
    if (!inputText.trim()) {
      alert('Please enter text or upload a file first.');
      return;
    }

    setIsGenerating(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          text: inputText,
          mode,
          questionCount,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Generation failed.');

      if (mode === 'flashcards' && result.data?.cards) {
        setFlashcards(result.data.cards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
      } else if (mode === 'quiz' && result.data?.questions) {
        setQuizQuestions(result.data.questions);
        setQuizTitle(result.data.quizTitle || 'Practice Quiz');
        setUserAnswers({});
        setShowQuizResults(false);
      } else if (mode === 'summary' && result.data) {
        setSummaryData(result.data);
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Generated Content to Supabase
  const handleSaveToSupabase = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        title: title || 'Untitled Study Set',
        mode,
        content: mode === 'flashcards' ? flashcards : mode === 'quiz' ? quizQuestions : summaryData,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('study_sets').insert([payload]);
      if (error) throw error;

      setSaveSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Failed to save to Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  // Quiz Score Calculation
  const calculateQuizScore = () => {
    let correct = 0;
    quizQuestions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswerIndex) {
        correct++;
      }
    });
    return correct;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-blue-500" /> AI Study Assistant
        </h1>
        <p className="text-slate-400 mt-1">
          Upload lecture notes, PDFs, or PowerPoints to generate flashcards, practice quizzes, or summaries.
        </p>
      </header>

      {/* Mode Selection Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 mb-6">
        <button
          onClick={() => setMode('flashcards')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
            mode === 'flashcards' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Flashcards
        </button>
        <button
          onClick={() => setMode('quiz')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
            mode === 'quiz' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <HelpCircle className="w-4 h-4" /> Practice Quiz
        </button>
        <button
          onClick={() => setMode('summary')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
            mode === 'summary' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" /> Summary
        </button>
      </div>

      {/* Inputs Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 mb-8">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Title / Topic (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g., Biology Chapter 4 - Cell Division"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>

        {/* File Upload Section */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Upload File (.pdf, .pptx, .txt)
          </label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors border border-slate-700">
              <Upload className="w-4 h-4" />
              <span>{isParsingFile ? 'Parsing File...' : 'Choose File'}</span>
              <input
                type="file"
                accept=".pdf,.pptx,.txt"
                onChange={handleFileUpload}
                disabled={isParsingFile}
                className="hidden"
              />
            </label>
            {selectedFile && (
              <span className="text-xs text-slate-400 truncate max-w-xs">{selectedFile.name}</span>
            )}
          </div>
        </div>

        {/* Raw Text Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Study Material Content
          </label>
          <textarea
            rows={5}
            placeholder="Paste study notes or text content here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>

        {/* Quiz Specific Question Count Selector */}
        {mode === 'quiz' && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Number of Questions:
            </span>
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setQuestionCount(10)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  questionCount === 10
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                10 Questions
              </button>
              <button
                type="button"
                onClick={() => setQuestionCount(25)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  questionCount === 25
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                25 Questions
              </button>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isParsingFile}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          {isGenerating ? (
            <>
              <RotateCw className="w-4 h-4 animate-spin" /> Generating {mode}...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate {mode === 'flashcards' ? 'Flashcards' : mode === 'quiz' ? `Quiz (${questionCount} Qs)` : 'Summary'}
            </>
          )}
        </button>
      </div>

      {/* FLASHCARDS VIEW */}
      {mode === 'flashcards' && flashcards.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Flashcard Deck ({flashcards.length} cards)
            </h2>
            <button
              onClick={handleSaveToSupabase}
              disabled={isSaving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700"
            >
              <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Set'}
            </button>
          </div>

          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="cursor-pointer min-h-[260px] bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all shadow-xl relative"
          >
            <span className="absolute top-4 left-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {isFlipped ? 'Answer / Definition' : 'Prompt / Question'}
            </span>
            <p className="text-lg md:text-xl font-medium text-slate-100 max-w-xl">
              {isFlipped
                ? flashcards[currentCardIndex].back
                : flashcards[currentCardIndex].front}
            </p>
            {!isFlipped && flashcards[currentCardIndex].hint && (
              <p className="mt-4 text-xs text-blue-400 bg-blue-950/50 px-3 py-1 rounded-full border border-blue-800/50">
                Hint: {flashcards[currentCardIndex].hint}
              </p>
            )}
            <span className="absolute bottom-4 text-xs text-slate-500">Click card to flip</span>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setCurrentCardIndex((prev) => Math.max(0, prev - 1));
                setIsFlipped(false);
              }}
              disabled={currentCardIndex === 0}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-50 text-slate-300 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-slate-400">
              {currentCardIndex + 1} of {flashcards.length}
            </span>
            <button
              onClick={() => {
                setCurrentCardIndex((prev) => Math.min(flashcards.length - 1, prev + 1));
                setIsFlipped(false);
              }}
              disabled={currentCardIndex === flashcards.length - 1}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-50 text-slate-300 hover:text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* QUIZ VIEW */}
      {mode === 'quiz' && quizQuestions.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {quizTitle} ({quizQuestions.length} Questions)
            </h2>
            <button
              onClick={handleSaveToSupabase}
              disabled={isSaving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700"
            >
              <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Quiz'}
            </button>
          </div>

          <div className="space-y-6">
            {quizQuestions.map((q, qIdx) => (
              <div key={q.id || qIdx} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <p className="font-medium text-slate-100">
                  {qIdx + 1}. {q.question}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userAnswers[qIdx] === optIdx;
                    const isCorrect = q.correctAnswerIndex === optIdx;
                    let btnStyle = 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700';

                    if (showQuizResults) {
                      if (isCorrect) {
                        btnStyle = 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200';
                      } else if (isSelected && !isCorrect) {
                        btnStyle = 'bg-rose-950/60 border-rose-500/50 text-rose-200';
                      }
                    } else if (isSelected) {
                      btnStyle = 'bg-blue-950 border-blue-500 text-blue-200';
                    }

                    return (
                      <button
                        key={optIdx}
                        disabled={showQuizResults}
                        onClick={() => setUserAnswers({ ...userAnswers, [qIdx]: optIdx })}
                        className={`text-left p-3 rounded-lg text-sm border transition-all flex items-center justify-between ${btnStyle}`}
                      >
                        <span>{opt}</span>
                        {showQuizResults && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {showQuizResults && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {showQuizResults && q.explanation && (
                  <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <span className="font-semibold text-slate-300">Explanation:</span> {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!showQuizResults ? (
            <button
              onClick={() => setShowQuizResults(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg transition-all"
            >
              Submit Quiz Answers
            </button>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-2">
              <h3 className="text-lg font-bold text-white">Quiz Score</h3>
              <p className="text-2xl font-black text-emerald-400">
                {calculateQuizScore()} / {quizQuestions.length} ({Math.round((calculateQuizScore() / quizQuestions.length) * 100)}%)
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUMMARY VIEW */}
      {mode === 'summary' && summaryData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Study Summary Notes</h2>
            <button
              onClick={handleSaveToSupabase}
              disabled={isSaving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700"
            >
              <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Summary'}
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">
                Overview
              </h3>
              <p className="text-slate-300 leading-relaxed text-sm">{summaryData.overview}</p>
            </div>

            {summaryData.keyTakeaways?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">
                  Key Takeaways
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-300">
                  {summaryData.keyTakeaways.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {summaryData.keyTerms?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">
                  Key Terms & Definitions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summaryData.keyTerms.map((kt, idx) => (
                    <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <span className="font-semibold text-slate-100 text-sm block mb-1">
                        {kt.term}
                      </span>
                      <span className="text-xs text-slate-400 leading-normal">{kt.definition}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}