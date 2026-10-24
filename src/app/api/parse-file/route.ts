import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';

// Clean pure JS import that Turbopack supports natively
// @ts-ignore
import pdfParse from 'pdf-parse-fork';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    let extractedText = '';

    // 1. PDF FILE PARSING
    if (fileName.endsWith('.pdf')) {
      const parsedData = await pdfParse(buffer);
      extractedText = parsedData.text;
    } 
    // 2. POWERPOINT (.pptx) FILE PARSING
    else if (fileName.endsWith('.pptx')) {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files).filter(
        (fName) => fName.startsWith('ppt/slides/slide') && fName.endsWith('.xml')
      );

      slideFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
        return numA - numB;
      });

      const slideTexts: string[] = [];

      for (const slidePath of slideFiles) {
        const xmlContent = await zip.files[slidePath].async('text');
        const result = await parseStringPromise(xmlContent);

        const textNodes: string[] = [];
        const extractText = (obj: any) => {
          if (!obj) return;
          if (typeof obj === 'string') return;
          if (Array.isArray(obj)) {
            obj.forEach(extractText);
          } else if (typeof obj === 'object') {
            for (const key in obj) {
              if (key === 'a:t') {
                const values = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
                values.forEach((val) => {
                  if (typeof val === 'string') textNodes.push(val);
                  else if (val._) textNodes.push(val._);
                });
              } else {
                extractText(obj[key]);
              }
            }
          }
        };

        extractText(result);
        if (textNodes.length > 0) {
          slideTexts.push(textNodes.join(' '));
        }
      }

      extractedText = slideTexts.join('\n\n');
    } 
    // 3. PLAINTEXT (.txt) FILE PARSING
    else if (fileName.endsWith('.txt')) {
      extractedText = buffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a .pdf, .pptx, or .txt file.' },
        { status: 400 }
      );
    }

    if (!extractedText || !extractedText.trim()) {
      return NextResponse.json(
        { error: 'Could not extract readable text from this file.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: extractedText });
  } catch (error: any) {
    console.error('File parsing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse file.' },
      { status: 500 }
    );
  }
}