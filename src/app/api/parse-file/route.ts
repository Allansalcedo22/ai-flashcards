import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Large PDFs and slide decks can take a while to read
export const maxDuration = 60;

const PLAIN_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];

// Collects every <a:t> text run from a parsed PowerPoint XML document
function collectPptxText(obj: unknown, textNodes: string[]) {
  if (!obj || typeof obj === 'string') return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectPptxText(item, textNodes));
    return;
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      if (key === 'a:t') {
        const values = Array.isArray(record[key]) ? (record[key] as unknown[]) : [record[key]];
        values.forEach((val) => {
          if (typeof val === 'string') textNodes.push(val);
          else if (val && typeof val === 'object' && '_' in val) textNodes.push(String((val as { _: unknown })._));
        });
      } else {
        collectPptxText(record[key], textNodes);
      }
    }
  }
}

async function readPptxXmlText(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) return '';
  // Drop slide-number placeholder shapes so "12" doesn't show up as note text
  const xml = (await file.async('text')).replace(
    /<p:sp>(?:(?!<\/p:sp>)[\s\S])*type="sldNum"(?:(?!<\/p:sp>)[\s\S])*<\/p:sp>/g,
    ''
  );
  const result = await parseStringPromise(xml);
  const textNodes: string[] = [];
  collectPptxText(result, textNodes);
  return textNodes.join(' ').trim();
}

async function parsePptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter((fName) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(fName)
  );

  const slideNumber = (path: string) => parseInt(path.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
  slideFiles.sort((a, b) => slideNumber(a) - slideNumber(b));

  const slideTexts: string[] = [];

  for (const slidePath of slideFiles) {
    const slideText = await readPptxXmlText(zip, slidePath);

    // Speaker notes are linked from the slide's .rels file; professors often put the real explanation there
    let notesText = '';
    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const notesTarget = (await relsFile.async('text')).match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];
      if (notesTarget) {
        notesText = await readPptxXmlText(zip, `ppt/notesSlides/${notesTarget}`);
      }
    }

    const parts = [`Slide ${slideNumber(slidePath)}: ${slideText}`];
    if (notesText) parts.push(`Speaker notes: ${notesText}`);
    if (slideText || notesText) slideTexts.push(parts.join('\n'));
  }

  return slideTexts.join('\n\n');
}

async function parsePdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // Remove the "-- 1 of 3 --" page markers pdf-parse adds, so scanned PDFs correctly come back empty
    return result.text.replace(/\n*-- \d+ of \d+ --\n*/g, '\n\n').trim();
  } finally {
    await parser.destroy();
  }
}

export async function POST(req: Request) {
  const limit = checkRateLimit(`parse:${getClientIp(req)}`, 60, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many uploads. Please try again in ${limit.retryAfterMinutes} minutes.` },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      extractedText = await parsePdf(buffer);
    } else if (fileName.endsWith('.pptx')) {
      extractedText = await parsePptx(buffer);
    } else if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (PLAIN_TEXT_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      extractedText = buffer.toString('utf-8');
    } else if (fileName.endsWith('.doc') || fileName.endsWith('.ppt')) {
      return NextResponse.json(
        { error: 'Older .doc/.ppt files aren\'t supported. Please re-save it as .docx/.pptx or export it as a PDF.' },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a .pdf, .docx, .pptx, .txt, or .md file.' },
        { status: 400 }
      );
    }

    if (!extractedText || !extractedText.trim()) {
      return NextResponse.json(
        {
          error: fileName.endsWith('.pdf')
            ? 'No readable text found. This looks like a scanned or image-only PDF, which isn\'t supported yet. Try a PDF with selectable text, or paste the text in.'
            : 'Could not extract readable text from this file.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: extractedText });
  } catch (error: unknown) {
    console.error('File parsing error:', error);
    return NextResponse.json(
      { error: 'This file could not be read. It may be damaged or password-protected.' },
      { status: 500 }
    );
  }
}
