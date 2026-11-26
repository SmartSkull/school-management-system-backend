/**
 * Turning an uploaded exam paper into questions.
 *
 * Everything here is deliberately free of Nest and Prisma so it can be reasoned
 * about (and tested) on its own — the service only supplies the model call.
 *
 * This replaces a rules-based parser that only recognised four option layouts,
 * silently defaulted a missing answer to "A", and dropped whatever it could not
 * match. The instructions below put the same guarantees in the prompt instead:
 * transcribe rather than correct, never invent an answer, and never invent,
 * merge or split a question.
 */

export const QUESTION_EXTRACTION_PROMPT = `You convert raw exam paper text into structured questions.

Return ONLY valid JSON — no prose, no markdown fences, no explanation.

Shape:
{"questions":[{"number":"1","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","section":"SECTION A","type":"mcq"}]}

## Transcription rules
- Copy the question text and every option EXACTLY as printed. Never correct grammar, spelling or punctuation.
- Preserve symbols, units, formulas, subscripts, chemical equations and figure references (e.g. "as shown in Fig. 2").
- Put the question number in "number" and strip it from the start of "question".

## Options
- Options may use any labelling style: (a)(b)(c)(d), A. B. C. D., A) B) C) D), A- B- C- D-, or i. ii. iii. iv.
- Always relabel them A, B, C, D (and E if a fifth exists) in the order they are printed.
- Keep up to five options.

## Answers
- Look for the answer in ALL of these places:
  1. An "Answer:", "Ans:", "Correct answer:", "Key:" or "★" / "*" marker immediately after or below the question.
  2. A bold, underlined, circled or asterisked option within the question.
  3. A separate answer key anywhere in the paper (e.g. "1.B  2.C  3.A ...").
- Record the matching relabelled letter (A–E).
- If the paper gives no answer at all, set answer to null. NEVER guess or default to any letter.

## Sections / headings
- section: the heading text exactly as printed, e.g. "SECTION A: OBJECTIVES".
- When a question has no heading of its own, repeat the heading of the most recent question before it.
- Use "" when the paper has no headings at all.

## Coverage
- Read EVERY question in the text from start to finish. Do not stop early.
- type: "mcq" when the question has options, "theory" when it has none.
- Do NOT merge two questions into one; do NOT split one question in two.
- Skip anything that is not a question: instructions, passage text, page numbers, mark totals, headers, footers, answer keys.`;

/** How much text one model call is given before the paper is split. */
const CHUNK_SIZE = 100_000;

export interface ExtractionTally {
  /** Questions with no usable options — the bank stores multiple choice only. */
  theory: number;
  /** Questions the paper never answered. Left blank rather than guessed. */
  noAnswer: number;
  /** Items the model returned that carried no readable question text. */
  unreadable: number;
}

export const emptyTally = (): ExtractionTally => ({ theory: 0, noAnswer: 0, unreadable: 0 });

/**
 * Pulls the JSON object out of a model reply. Models wrap JSON in prose or
 * fences often enough that trusting the raw string is not worth it, and a
 * provider that supports a strict JSON flag is not guaranteed here.
 */
export function parseJsonBlock(content: string): any | null {
  const cleaned = String(content ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Splits a paper so no single call exceeds the model's usable input. Cuts are
 * taken at a blank line, then at any newline, so a question is not cut in half
 * where the text allows it.
 */
export function splitForExtraction(text: string, size: number = CHUNK_SIZE): string[] {
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n\n', size);
    if (cut < size / 2) cut = rest.lastIndexOf('\n', size);
    if (cut < size / 2) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

/** Tells the model which heading the chunk started inside. */
export function continuationPrompt(section: string, chunk: string): string {
  return `The text below continues a section headed "${section}". Use that heading for any question that has no heading of its own.\n\n${chunk}`;
}

/** Accepts the option shapes a model may return for one question. */
function optionList(item: any): string[] {
  const raw = item?.options ?? item?.option ?? item;
  const letters = ['a', 'b', 'c', 'd', 'e'];

  if (Array.isArray(raw)) return raw.map((v) => String(v ?? '').trim());

  const values: string[] = [];
  for (const letter of letters) {
    const upper = raw?.[letter.toUpperCase()];
    const lower = raw?.[letter];
    values.push(String(upper ?? lower ?? '').trim());
  }
  return values;
}

/**
 * Validates what the model returned and appends the questions worth keeping.
 *
 * The important behaviour is what it refuses: a question with no real options is
 * counted as theory rather than imported as a broken multiple choice, and an
 * answer pointing at an option the paper never printed is discarded rather than
 * left to mark a student wrong.
 */
export function collectExtractedQuestions(raw: any, out: any[], tally: ExtractionTally): void {
  const items = Array.isArray(raw?.questions) ? raw.questions : Array.isArray(raw) ? raw : [];
  const seen = new Set(out.map((q) => String(q.question).toLowerCase().replace(/\s+/g, ' ').slice(0, 200)));

  for (const item of items) {
    const question = String(item?.question ?? item?.text ?? '').trim();
    if (!question) {
      tally.unreadable += 1;
      continue;
    }

    const options = optionList(item);
    // Option A and B are the two the bank requires, so anything without them is
    // not a multiple-choice question however it was labelled.
    if (!options[0] || !options[1]) {
      tally.theory += 1;
      continue;
    }

    const fingerprint = question.toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    let answer = String(item?.answer ?? '')
      .trim()
      // The marker gets echoed back often enough that stripping it is cheaper
      // than losing an answer the paper did state.
      .replace(/^(?:correct\s+)?(?:answer|ans)\s*[:\-]?\s*/i, '')
      .toUpperCase()
      .replace(/[^A-E]/g, '');
    if (answer.length !== 1) answer = '';
    // An answer that names an option the paper did not print is worse than no
    // answer at all: it would mark every student wrong.
    if (answer && !options[answer.charCodeAt(0) - 65]) answer = '';
    if (!answer) tally.noAnswer += 1;

    out.push({
      question,
      option1: options[0],
      option2: options[1],
      option3: options[2] ?? '',
      option4: options[3] ?? '',
      answer,
      sectionLabel: String(item?.section ?? item?.sectionLabel ?? '').trim(),
      sectionOrder: 0,
    });
  }
}

/** Numbers the sections in the order the paper introduced them. */
export function assignSectionOrder(questions: any[]): void {
  const order = new Map<string, number>();
  for (const question of questions) {
    const label = question.sectionLabel ?? '';
    if (!order.has(label)) order.set(label, order.size + 1);
    question.sectionOrder = order.get(label) ?? 0;
  }
}

/**
 * Reads the text out of an uploaded document. Images are not handled here — they
 * go to a vision model instead, since there is no text to read.
 */
export async function readUploadedDocument(file: {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}): Promise<string> {
  const name = (file.originalname ?? '').toLowerCase();
  const mime = file.mimetype ?? '';

  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    // pdf-parse v2 exports a class; v1's callable default export is gone, so
    // calling it directly throws and a caller with a try/catch reads an empty
    // paper instead of the real one.
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    try {
      // v2 appends a "-- 1 of 12 --" marker at every page boundary by default.
      // It reads as content to a model, and nothing here needs page numbers.
      const result = await parser.getText({ pageJoiner: '' });
      return result?.text ?? '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (name.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value ?? '';
  }

  return file.buffer.toString('utf8');
}
