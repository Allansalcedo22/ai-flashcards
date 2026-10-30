// Reads files directly in the visitor's browser. Used for files too big to upload:
// hosts like Vercel reject request bodies over 4.5 MB, but the text inside a large
// PDF or slide deck is usually tiny (most of the size is images), so only that text is sent on.

async function parsePdf(file: File) {
  const { PDFParse } = await import('pdf-parse');
  // Worker file is copied into /public by the copy-pdf-worker script (runs on install and build) so it always matches the installed version
  PDFParse.setWorker('/pdf.worker.mjs');

  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const result = await parser.getText();
    // Remove the "-- 1 of 3 --" page markers pdf-parse adds, so scanned PDFs correctly come back empty
    return result.text.replace(/\n*-- \d+ of \d+ --\n*/g, '\n\n').trim();
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(file: File) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

function readPptxXmlText(xml: string) {
  // Drop slide-number placeholder shapes so "12" doesn't show up as note text
  const cleaned = xml.replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*type="sldNum"(?:(?!<\/p:sp>)[\s\S])*<\/p:sp>/g, '');
  const doc = new DOMParser().parseFromString(cleaned, 'application/xml');
  return Array.from(doc.getElementsByTagName('a:t'))
    .map((node) => node.textContent || '')
    .join(' ')
    .trim();
}

async function parsePptx(file: File) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const slideNumber = (path: string) => parseInt(path.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
  const slideFiles = Object.keys(zip.files)
    .filter((fName) => /^ppt\/slides\/slide\d+\.xml$/.test(fName))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slideTexts: string[] = [];

  for (const slidePath of slideFiles) {
    const slideText = readPptxXmlText(await zip.file(slidePath)!.async('text'));

    // Speaker notes are linked from the slide's .rels file
    let notesText = '';
    const relsFile = zip.file(slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels');
    if (relsFile) {
      const notesTarget = (await relsFile.async('text')).match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];
      const notesFile = notesTarget && zip.file(`ppt/notesSlides/${notesTarget}`);
      if (notesFile) notesText = readPptxXmlText(await notesFile.async('text'));
    }

    const parts = [`Slide ${slideNumber(slidePath)}: ${slideText}`];
    if (notesText) parts.push(`Speaker notes: ${notesText}`);
    if (slideText || notesText) slideTexts.push(parts.join('\n'));
  }

  return slideTexts.join('\n\n');
}

export async function parseFileInBrowser(file: File) {
  const fileName = file.name.toLowerCase();
  let text = '';

  try {
    if (fileName.endsWith('.pdf')) text = await parsePdf(file);
    else if (fileName.endsWith('.docx')) text = await parseDocx(file);
    else if (fileName.endsWith('.pptx')) text = await parsePptx(file);
    else if (/\.(txt|md|markdown)$/.test(fileName)) text = await file.text();
    else if (fileName.endsWith('.doc') || fileName.endsWith('.ppt')) {
      throw new Error('Older .doc/.ppt files aren\'t supported. Please re-save it as .docx/.pptx or export it as a PDF.');
    } else {
      throw new Error('Unsupported file type. Please upload a .pdf, .docx, .pptx, .txt, or .md file.');
    }
  } catch (err: unknown) {
    // Keep our own friendly messages; anything else is a damaged or locked file
    if (err instanceof Error && /supported/.test(err.message)) throw err;
    console.error('Browser parsing error:', err);
    throw new Error('This file could not be read. It may be damaged or password-protected.');
  }

  if (!text.trim()) {
    throw new Error(
      fileName.endsWith('.pdf')
        ? 'No readable text found. This looks like a scanned or image-only PDF, which isn\'t supported yet.'
        : 'Could not extract readable text from this file.'
    );
  }

  return text;
}
