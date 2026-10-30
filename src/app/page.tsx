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
  ChevronLeft,
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parseFileInBrowser } from '@/lib/parseInBrowser';

type AppMode = 'flashcards' | 'quiz' | 'summary';

interface Flashcard {
  front: string;
  back: string;
  explanation?: string;
  example?: string;
  hint?: string;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  difficulty?: 'recall' | 'application' | 'analysis';
  concept?: string;
  explanation: string;
  optionExplanations?: string[];
}

interface StudySection {
  heading: string;
  explanation: string;
  keyPoints?: string[];
  example?: string;
  misconceptions?: string[];
}

interface SummaryData {
  overview: string;
  learningObjectives?: string[];
  sections?: StudySection[];
  keyTerms: { term: string; definition: string; example?: string }[];
  connections?: string;
  keyTakeaways: string[];
  reviewQuestions?: { question: string; answer: string }[];
}

const DIFFICULTY_STYLES: Record<string, string> = {
  recall: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
  application: 'bg-violet-950/60 text-violet-300 border-violet-800/60',
  analysis: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
};

// Splits AI text on blank lines so long explanations render as real paragraphs
function Paragraphs({ text, className = '' }: { text?: string; className?: string }) {
  if (!text) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {text.split(/\n\s*\n/).map((para, idx) => (
        <p key={idx}>{para.trim()}</p>
      ))}
    </div>
  );
}

// Saving is off until the app has user accounts (saved sets can't be reopened yet and the table is shared).
// Set NEXT_PUBLIC_ENABLE_SAVE=true in .env.local to turn the Save buttons back on.
const SAVE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SAVE === 'true';

// Files up to this size are uploaded to the server; bigger ones are read in the browser,
// since hosts like Vercel reject uploads over 4.5 MB
const MAX_UPLOAD_SIZE_MB = 4;
// Hard cap so a huge file can't freeze the visitor's browser
const MAX_FILE_SIZE_MB = 100;
// gpt-4o-mini reads ~128k tokens; ~4 characters per token leaves room for the prompt and the answer
const MAX_TOTAL_CHARS = 400_000;

export default function Home() {
  const [mode, setMode] = useState<AppMode>('flashcards');
  const [title, setTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parsingProgress, setParsingProgress] = useState('');
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

  // Study Guide: which review-question answers are revealed
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  // Handle File Upload & Parsing (several files are combined into one study set)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Reset so picking the same file again still triggers onChange
    e.target.value = '';
    if (files.length === 0) return;

    const tooLarge = files.filter((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);

    setIsParsingFile(true);

    const parsedSections: string[] = [];
    const parsedNames: string[] = [];
    const failed: string[] = tooLarge.map((f) => `${f.name} (over ${MAX_FILE_SIZE_MB} MB)`);

    // Parse one at a time so each request stays small and documents keep their order
    for (const [idx, file] of validFiles.entries()) {
      setParsingProgress(`Parsing ${idx + 1} of ${validFiles.length}...`);

      try {
        let text: string;

        if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
          text = await parseFileInBrowser(file);
        } else {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/parse-file', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to parse file.');
          text = data.text;
        }

        // Label each document so the AI knows where one ends and the next begins
        parsedSections.push(`=== Document: ${file.name} ===\n${text.trim()}`);
        parsedNames.push(file.name);
      } catch (err: unknown) {
        failed.push(`${file.name} (${err instanceof Error ? err.message : 'could not be read'})`);
      }
    }

    if (parsedSections.length > 0) {
      // Add to what's already in the box instead of replacing it
      setInputText((prev) => [prev.trim(), ...parsedSections].filter(Boolean).join('\n\n'));
      setUploadedFileNames((prev) => [...prev, ...parsedNames]);
    }

    if (failed.length > 0) {
      alert(`These files were skipped:\n\n${failed.join('\n')}`);
    }

    setParsingProgress('');
    setIsParsingFile(false);
  };

  const handleClearFiles = () => {
    setUploadedFileNames([]);
    setInputText('');
  };

  // Handle Study Material Generation
  const handleGenerate = async () => {
    if (!inputText.trim()) {
      alert('Please enter text or upload a file first.');
      return;
    }

    if (inputText.length > MAX_TOTAL_CHARS) {
      alert(
        `That's too much material for one study set (${inputText.length.toLocaleString()} characters; the limit is about ${MAX_TOTAL_CHARS.toLocaleString()}). Try fewer or smaller documents.`
      );
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
        setRevealedAnswers({});
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'An error occurred during generation.');
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save to Supabase.');
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

  // Concepts behind missed questions, so students know what to review
  const getMissedConcepts = () => {
    const missed = quizQuestions
      .filter((q, idx) => userAnswers[idx] !== q.correctAnswerIndex)
      .map((q) => q.concept)
      .filter((c): c is string => Boolean(c));
    return Array.from(new Set(missed));
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-blue-500" /> AI Study Assistant
        </h1>
        <p className="text-slate-400 mt-1">
          Upload lecture notes, PDFs, Word docs, or PowerPoints to generate in-depth flashcards, practice quizzes, and full study guides.
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
          <FileText className="w-4 h-4" /> Study Guide
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
            Upload Files (.pdf, .docx, .pptx, .txt, .md)
          </label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors border border-slate-700">
              <Upload className="w-4 h-4" />
              <span>{isParsingFile ? parsingProgress || 'Parsing...' : 'Choose Files'}</span>
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md"
                multiple
                onChange={handleFileUpload}
                disabled={isParsingFile}
                className="hidden"
              />
            </label>
            <span className="text-xs text-slate-500">
              Pick several at once, or add more later. Max {MAX_FILE_SIZE_MB} MB each.
            </span>
          </div>

          {uploadedFileNames.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {uploadedFileNames.map((name, idx) => (
                <span
                  key={`${name}-${idx}`}
                  className="text-xs text-slate-300 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-full truncate max-w-xs"
                >
                  {name}
                </span>
              ))}
              <button
                type="button"
                onClick={handleClearFiles}
                disabled={isParsingFile}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-300 px-2 py-1"
              >
                <X className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
          )}
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
              <RotateCw className="w-4 h-4 animate-spin" /> Generating {mode === 'summary' ? 'study guide' : mode}... (in-depth content can take up to a minute)
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate {mode === 'flashcards' ? 'Flashcards' : mode === 'quiz' ? `Quiz (${questionCount} Qs)` : 'Study Guide'}
            </>
          )}
        </button>
      </div>

      {/* FLASHCARDS VIEW */}
      {mode === 'flashcards' && flashcards.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Flashcard Deck ({flashcards.length} cards)
            </h2>
            {SAVE_ENABLED && (
              <button
                onClick={handleSaveToSupabase}
                disabled={isSaving}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-700"
              >
                <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Set'}
              </button>
            )}
          </div>

          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="cursor-pointer min-h-[260px] bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all shadow-xl relative"
          >
            <span className="absolute top-4 left-4 text-sm font-semibold text-slate-500 uppercase tracking-widest">
              {isFlipped ? 'Answer / Definition' : 'Prompt / Question'}
            </span>
            <p className="text-xl md:text-2xl font-medium text-slate-100 max-w-xl mt-6">
              {isFlipped
                ? flashcards[currentCardIndex].back
                : flashcards[currentCardIndex].front}
            </p>
            {isFlipped && (flashcards[currentCardIndex].explanation || flashcards[currentCardIndex].example) && (
              <div className="mt-6 mb-6 w-full max-w-2xl text-left space-y-3">
                {flashcards[currentCardIndex].explanation && (
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                    <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider block mb-1">
                      Why it works
                    </span>
                    <p className="text-base text-slate-300 leading-relaxed">
                      {flashcards[currentCardIndex].explanation}
                    </p>
                  </div>
                )}
                {flashcards[currentCardIndex].example && (
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                    <span className="text-sm font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
                      Example
                    </span>
                    <p className="text-base text-slate-300 leading-relaxed">
                      {flashcards[currentCardIndex].example}
                    </p>
                  </div>
                )}
              </div>
            )}
            {!isFlipped && flashcards[currentCardIndex].hint && (
              <p className="mt-4 text-sm text-blue-400 bg-blue-950/50 px-3 py-1 rounded-full border border-blue-800/50">
                Hint: {flashcards[currentCardIndex].hint}
              </p>
            )}
            <span className="absolute bottom-4 text-sm text-slate-500">Click card to flip</span>
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
            <span className="text-base font-medium text-slate-400">
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
            <h2 className="text-2xl font-bold text-white">
              {quizTitle} ({quizQuestions.length} Questions)
            </h2>
            {SAVE_ENABLED && (
              <button
                onClick={handleSaveToSupabase}
                disabled={isSaving}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-700"
              >
                <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Quiz'}
              </button>
            )}
          </div>

          <div className="space-y-6">
            {quizQuestions.map((q, qIdx) => (
              <div key={q.id || qIdx} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                {(q.difficulty || q.concept) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {q.difficulty && (
                      <span
                        className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          DIFFICULTY_STYLES[q.difficulty] || 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    )}
                    {q.concept && <span className="text-sm text-slate-500">{q.concept}</span>}
                  </div>
                )}
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
                        className={`text-left p-3 rounded-lg text-base border transition-all flex items-center justify-between ${btnStyle}`}
                      >
                        <span>{opt}</span>
                        {showQuizResults && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {showQuizResults && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {showQuizResults && (q.explanation || q.optionExplanations?.length) && (
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-3">
                    {q.explanation && (
                      <div>
                        <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider block mb-1">
                          Explanation
                        </span>
                        <p className="text-base text-slate-300 leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                    {q.optionExplanations && q.optionExplanations.length > 0 && (
                      <div>
                        <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider block mb-1">
                          Breaking down each option
                        </span>
                        <ul className="space-y-1.5">
                          {q.optionExplanations.map((why, optIdx) => (
                            <li key={optIdx} className="text-sm text-slate-400 leading-relaxed flex gap-2">
                              <span
                                className={`font-semibold shrink-0 ${
                                  optIdx === q.correctAnswerIndex ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <span>{why}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
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
              <h3 className="text-xl font-bold text-white">Quiz Score</h3>
              <p className="text-2xl font-black text-emerald-400">
                {calculateQuizScore()} / {quizQuestions.length} ({Math.round((calculateQuizScore() / quizQuestions.length) * 100)}%)
              </p>
              {getMissedConcepts().length > 0 && (
                <div className="pt-3 text-left">
                  <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Concepts to review
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {getMissedConcepts().map((concept) => (
                      <span
                        key={concept}
                        className="text-sm text-rose-200 bg-rose-950/50 border border-rose-800/50 px-2.5 py-1 rounded-full"
                      >
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUMMARY VIEW */}
      {mode === 'summary' && summaryData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Study Guide</h2>
            {SAVE_ENABLED && (
              <button
                onClick={handleSaveToSupabase}
                disabled={isSaving}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-700"
              >
                <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Study Guide'}
              </button>
            )}
          </div>

          {/* Overview & Learning Objectives */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider mb-2">
                Overview
              </h3>
              <Paragraphs text={summaryData.overview} className="text-slate-300 leading-relaxed text-base" />
            </div>

            {summaryData.learningObjectives && summaryData.learningObjectives.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider mb-2">
                  After studying this, you should be able to
                </h3>
                <ul className="space-y-1.5 text-base text-slate-300">
                  {summaryData.learningObjectives.map((obj, idx) => (
                    <li key={idx} className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Concept Sections */}
          {summaryData.sections?.map((section, sIdx) => (
            <div key={sIdx} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <h3 className="text-xl font-bold text-white">
                <span className="text-blue-500 mr-2">{sIdx + 1}.</span>
                {section.heading}
              </h3>

              <Paragraphs text={section.explanation} className="text-slate-300 leading-relaxed text-base" />

              {section.keyPoints && section.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">
                    Key Points
                  </h4>
                  <ul className="list-disc list-inside space-y-1.5 text-base text-slate-300">
                    {section.keyPoints.map((point, idx) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {section.example && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                    Example
                  </h4>
                  <Paragraphs text={section.example} className="text-base text-slate-300 leading-relaxed" />
                </div>
              )}

              {section.misconceptions && section.misconceptions.length > 0 && (
                <div className="bg-rose-950/30 border border-rose-800/40 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-2">
                    Common Misconceptions
                  </h4>
                  <ul className="space-y-1.5 text-base text-slate-300">
                    {section.misconceptions.map((m, idx) => (
                      <li key={idx} className="flex gap-2">
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {/* Connections, Takeaways, Terms */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            {summaryData.connections && (
              <div>
                <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider mb-2">
                  How It All Connects
                </h3>
                <Paragraphs text={summaryData.connections} className="text-slate-300 leading-relaxed text-base" />
              </div>
            )}

            {summaryData.keyTakeaways?.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider mb-2">
                  Key Takeaways
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-base text-slate-300">
                  {summaryData.keyTakeaways.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {summaryData.keyTerms?.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider mb-3">
                  Key Terms & Definitions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summaryData.keyTerms.map((kt, idx) => (
                    <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <span className="font-semibold text-slate-100 text-base block mb-1">
                        {kt.term}
                      </span>
                      <span className="text-sm text-slate-400 leading-normal block">{kt.definition}</span>
                      {kt.example && (
                        <span className="text-sm text-slate-500 italic leading-normal block mt-1.5">
                          e.g. {kt.example}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Self-Check Review Questions */}
          {summaryData.reviewQuestions && summaryData.reviewQuestions.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-blue-400 uppercase tracking-wider">
                  Check Your Understanding
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Try answering each question in your own words before revealing the model answer.
                </p>
              </div>
              {summaryData.reviewQuestions.map((rq, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                  <p className="text-base font-medium text-slate-100">
                    {idx + 1}. {rq.question}
                  </p>
                  {revealedAnswers[idx] ? (
                    <Paragraphs text={rq.answer} className="text-base text-slate-300 leading-relaxed border-l-2 border-blue-500 pl-3" />
                  ) : (
                    <button
                      onClick={() => setRevealedAnswers({ ...revealedAnswers, [idx]: true })}
                      className="text-sm font-medium text-blue-400 hover:text-blue-300"
                    >
                      Show answer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}