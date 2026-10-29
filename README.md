# AI Flashcards & Study Assistant

An AI-powered study platform built with Next.js 16, OpenAI, and Supabase. Upload lecture notes, PDFs, or PowerPoint presentations to automatically generate flashcards, practice quizzes, and high-yield study summaries.

## 🚀 Features

- 📄 **Multi-Format Document Parsing:** Upload `.pdf`, `.pptx`, or `.txt` files directly to extract text.
- 🎴 **Interactive Flashcards:** View generated flashcard decks with flip animations, hints, and navigation controls.
- 🧪 **Custom Practice Quizzes:** Generate 10-question or 25-question multiple-choice quizzes with instant grading and detailed explanations.
- 📝 **High-Yield Summaries:** Get concise topic overviews, key takeaways, and key term definitions.
- 💾 **Database Saving:** Save generated decks, quizzes, and summaries to Supabase for later study sessions.

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

### 4. Create the Supabase tables
Run this in the Supabase SQL Editor:

```sql
create table flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

create table flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references flashcard_decks(id) on delete cascade,
  front text not null,
  back text not null,
  hint text
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_answer_index int not null,
  explanation text
);

create table summaries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  overview text,
  key_takeaways jsonb default '[]',
  key_terms jsonb default '[]',
  created_at timestamptz default now()
);
```

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
│   │   ├── generate-deck/route.ts   # Sends text to OpenAI, returns flashcards / quiz / summary
│   │   ├── parse-file/route.ts      # Extracts text from uploaded PDF, PPTX, or TXT files
│   │   └── save-deck/route.ts       # Saves generated study sets to Supabase
│   ├── layout.tsx
│   ├── page.tsx                     # Main UI: upload, flashcards, quiz, summary views
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
