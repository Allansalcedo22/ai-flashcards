# AI Flashcards & Study Assistant

An AI-powered study platform built with Next.js 16, OpenAI, and Supabase. Upload lecture notes, PDFs, or PowerPoint presentations to automatically generate in-depth flashcards, practice quizzes, and full study guides that teach the subject, not just summarize it.

## 🚀 Features

- 📄 **Multi-Format Document Parsing:** Upload `.pdf`, `.pptx`, or `.txt` files directly to extract text.
- 🎴 **Interactive Flashcards:** Flip through 15-25 cards with hints, plus a deeper "why it works" explanation and a real-world example on every card.
- 🧪 **Custom Practice Quizzes:** Generate 10-question or 25-question quizzes mixing recall, application, and analysis questions, with a mini-lesson for each answer, a breakdown of why every option is right or wrong, and a list of concepts to review.
- 📝 **In-Depth Study Guides:** Get learning objectives, multi-paragraph explanations of each concept with examples and common misconceptions, key terms, how the ideas connect, and self-check questions with model answers.
- 💾 **Database Saving:** Save generated decks, quizzes, and study guides to Supabase for later study sessions.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS & Lucide React Icons
- **AI Engine:** OpenAI API (`gpt-4o-mini`)
- **Database:** Supabase
- **File Parsing:** `pdf-parse-fork`, `jszip`, `xml2js`

## 🏁 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Allansalcedo22/ai-flashcards.git
cd ai-flashcards
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Create a `.env.local` file in the project root:

```bash
# Supabase Keys
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key
```

### 4. Create the Supabase table
Every flashcard deck, quiz, and study guide is saved as one row in a `study_sets` table. The generated content is stored as JSON in the `content` column, so new fields are saved automatically.

Run this in the Supabase SQL Editor:

```sql
create table study_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mode text not null check (mode in ('flashcards', 'quiz', 'summary')),
  content jsonb not null,
  created_at timestamptz default now()
);

-- The app saves from the browser with the anon key, so allow it to insert and read rows
alter table study_sets enable row level security;

create policy "Allow anon inserts" on study_sets
  for insert to anon with check (true);

create policy "Allow anon reads" on study_sets
  for select to anon using (true);
```

> **Note:** These policies let anyone with your site's anon key read and add study sets. That's fine for a personal project; add Supabase Auth and per-user policies before sharing it publicly.

### 5. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate-deck/route.ts   # Sends text to OpenAI, returns flashcards / quiz / study guide
│   │   ├── parse-file/route.ts      # Extracts text from uploaded PDF, PPTX, or TXT files
│   │   └── save-deck/route.ts       # Alternative save endpoint (not used by the current UI)
│   ├── layout.tsx
│   ├── page.tsx                     # Main UI: upload, flashcards, quiz, study guide views; saves to study_sets
│   └── globals.css
└── lib/
    └── supabase.ts                  # Supabase client
```

## 📜 Scripts

| Command         | Description                  |
| --------------- | ---------------------------- |
| `npm run dev`   | Start the development server |
| `npm run build` | Build for production         |
| `npm run start` | Run the production build     |
| `npm run lint`  | Run ESLint                   |
