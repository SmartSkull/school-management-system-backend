import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

@Injectable()
export class BookgameService {
  private _openai: OpenAI | null = null;

  private get openai(): OpenAI {
    if (!this._openai) {
      this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._openai;
  }

  private ok(data: any = null, message = 'Success') {
    return { success: true, data, message };
  }

  async uploadDocument(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No document uploaded');

    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    let text = '';

    if (ext === 'txt') {
      text = fs.readFileSync(file.path, 'utf8');
    } else if (ext === 'pdf') {
      text = this.extractPdfText(fs.readFileSync(file.path));
    } else if (ext === 'docx') {
      text = this.extractDocxText(file.path);
    } else {
      fs.unlinkSync(file.path);
      throw new BadRequestException('Unsupported file type. Use PDF, DOCX, or TXT.');
    }

    text = text.replace(/\s+/g, ' ').trim().slice(0, 15000);

    if (!text) {
      fs.unlinkSync(file.path);
      throw new BadRequestException('Could not extract text from document.');
    }

    return this.ok({
      filename: file.originalname,
      text_length: text.length,
      text_preview: text.slice(0, 500) + '...',
      document_text: text,
    }, 'Document uploaded successfully');
  }

  async generateQuestions(body: any) {
    const { document_text, num_questions = 5 } = body;
    if (!document_text) throw new BadRequestException('No document text provided');

    const count = Math.min(+num_questions, 10);
    const prompt = `Based on the following document, generate exactly ${count} multiple choice questions.\n\nFor each question provide 4 options (A,B,C,D) with only one correct answer.\n\nDocument:\n${document_text}\n\nRespond in this exact JSON:\n{"questions":[{"id":1,"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A","explanation":"..."}]}`;

    const content = await this.callOpenAI(prompt);
    const match = content?.match(/\{[\s\S]*\}/);
    if (!match) throw new InternalServerErrorException('Invalid AI response');

    const data = JSON.parse(match[0]);
    if (!data?.questions) throw new InternalServerErrorException('Could not parse questions');

    return this.ok({ questions: data.questions, total: data.questions.length });
  }

  async checkAnswer(body: any) {
    const { question, user_answer, correct_answer, options = {}, explanation = '', document_context = '' } = body;
    const isCorrect = user_answer?.toUpperCase() === correct_answer?.toUpperCase();

    if (isCorrect) {
      return this.ok({ correct: true, message: 'Correct! Well done!', explanation, correct_answer });
    }

    const prompt = `A student answered incorrectly.\n\nQuestion: ${question}\nStudent's Answer: ${user_answer}. ${options[user_answer] || ''}\nCorrect Answer: ${correct_answer}. ${options[correct_answer] || ''}\nExplanation: ${explanation}\nContext: ${document_context.slice(0, 2000)}\n\nRespond in JSON: {"explanation":"...","tip":"..."}`;

    const content = await this.callOpenAI(prompt);
    let detailedExplanation = explanation;
    let tip = '';

    const match = content?.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        detailedExplanation = parsed.explanation || explanation;
        tip = parsed.tip || '';
      } catch {}
    }

    return this.ok({ correct: false, message: 'Not quite right. Let me explain...', your_answer: user_answer, correct_answer, explanation: detailedExplanation, tip });
  }

  private async callOpenAI(prompt: string): Promise<string | null> {
    try {
      const res = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an educational assistant. Always respond in valid JSON when asked.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });
      return res.choices[0]?.message?.content ?? null;
    } catch (e) {
      return null;
    }
  }

  private extractPdfText(buffer: Buffer): string {
    const content = buffer.toString('binary');
    let text = '';
    const streams = content.match(/stream\s*([\s\S]*?)\s*endstream/g) || [];
    for (const stream of streams) {
      const inner = stream.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
      const tjMatches = inner.match(/\((.*?)\)\s*Tj/gs) || [];
      tjMatches.forEach(m => { text += m.replace(/\((.*?)\)\s*Tj/s, '$1') + ' '; });
    }
    return text;
  }

  private extractDocxText(filepath: string): string {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filepath);
      const xml = zip.readAsText('word/document.xml');
      return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    } catch {
      return '';
    }
  }
}
