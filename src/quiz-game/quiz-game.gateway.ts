import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { Question } from './quiz-game.types';

interface Player { id: string; name: string; score: number; }

interface Room {
  id: string;
  schoolId: string;
  hostName: string;
  players: Map<string, Player>;
  questions: Question[];
  questionIndex: number;
  started: boolean;
  roundActive: boolean;
  roundWinner: string | null;
  subject: string;
}

function serializeRoom(r: Room) {
  return { id: r.id, hostName: r.hostName, subject: r.subject, playerCount: r.players.size, started: r.started, totalQuestions: r.questions.length };
}

@WebSocketGateway({ namespace: '/quiz-game', cors: { origin: '*' } })
export class QuizGameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private rooms = new Map<string, Room>();
  private _openai: OpenAI | null = null;

  private get openai() {
    if (!this._openai) this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._openai;
  }

  private broadcastLobby(schoolId: string) {
    const rooms = [...this.rooms.values()]
      .filter(r => r.schoolId === schoolId && !r.started)
      .map(serializeRoom);
    this.server.to(`school:${schoolId}`).emit('lobby-update', { rooms });
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.rooms.forEach((room, roomId) => {
      if (!room.players.has(client.id)) return;
      room.players.delete(client.id);
      this.server.to(roomId).emit('room-update', { players: [...room.players.values()] });
      this.broadcastLobby(room.schoolId);
      if (room.players.size === 0) this.rooms.delete(roomId);
    });
  }

  @SubscribeMessage('watch-lobby')
  handleWatchLobby(@ConnectedSocket() client: Socket, @MessageBody() data: { schoolId: string }) {
    client.join(`school:${data.schoolId}`);
    const rooms = [...this.rooms.values()]
      .filter(r => r.schoolId === data.schoolId && !r.started)
      .map(serializeRoom);
    client.emit('lobby-update', { rooms });
  }

  @SubscribeMessage('create-room')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { schoolId: string; playerName: string; questions: Question[]; subject: string },
  ) {
    const roomId = `quiz-${data.schoolId}-${Date.now()}`;
    this.rooms.set(roomId, {
      id: roomId,
      schoolId: data.schoolId,
      hostName: data.playerName,
      players: new Map([[client.id, { id: client.id, name: data.playerName, score: 0 }]]),
      questions: data.questions,
      questionIndex: 0,
      started: false,
      roundActive: false,
      roundWinner: null,
      subject: data.subject,
    });
    client.join(roomId);
    client.emit('room-joined', { roomId, players: [{ id: client.id, name: data.playerName, score: 0 }] });
    this.broadcastLobby(data.schoolId);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerName: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) { client.emit('error', { message: 'Room not found' }); return; }
    if (room.started) { client.emit('error', { message: 'Game already started' }); return; }
    room.players.set(client.id, { id: client.id, name: data.playerName, score: 0 });
    client.join(data.roomId);
    this.server.to(data.roomId).emit('room-update', { players: [...room.players.values()] });
    client.emit('room-joined', { roomId: data.roomId, players: [...room.players.values()] });
    this.broadcastLobby(room.schoolId);
  }

  @SubscribeMessage('start-game')
  handleStartGame(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room || room.players.size < 2) { client.emit('error', { message: 'Need at least 2 players' }); return; }
    room.started = true;
    room.roundActive = true;
    this.broadcastLobby(room.schoolId);
    this.sendQuestion(data.roomId);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; answer: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room || !room.roundActive) return;
    const q = room.questions[room.questionIndex];
    const player = room.players.get(client.id);
    if (!player) return;

    // First correct answer wins the round
    if (data.answer.toUpperCase() === q.correct_answer.toUpperCase()) {
      room.roundActive = false;
      player.score += 1;
      room.roundWinner = player.name;
      this.server.to(data.roomId).emit('round-result', {
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        winner: player.name,
        players: [...room.players.values()],
      });
      this.scheduleNextQuestion(data.roomId);
    } else {
      client.emit('wrong-answer', { answer: data.answer });
    }
  }

  @SubscribeMessage('time-up')
  handleTimeUp(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room || !room.roundActive) return;
    const q = room.questions[room.questionIndex];
    room.roundActive = false;
    this.server.to(data.roomId).emit('round-result', {
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      winner: null,
      players: [...room.players.values()],
    });
    this.scheduleNextQuestion(data.roomId);
  }

  private sendQuestion(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const q = room.questions[room.questionIndex];
    this.server.to(roomId).emit('question', {
      question: q.question,
      options: q.options,
      questionIndex: room.questionIndex,
      totalQuestions: room.questions.length,
    });
  }

  private scheduleNextQuestion(roomId: string) {
    setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      if (room.questionIndex + 1 >= room.questions.length) {
        const sorted = [...room.players.values()].sort((a, b) => b.score - a.score);
        this.server.to(roomId).emit('game-over', { players: sorted });
        this.rooms.delete(roomId);
      } else {
        room.questionIndex++;
        room.roundActive = true;
        this.sendQuestion(roomId);
      }
    }, 5000);
  }

  // HTTP-style: generate questions from uploaded text (called from controller)
  async generateQuestions(documentText: string, numQuestions = 8): Promise<Question[]> {
    const count = Math.min(numQuestions, 15);
    const prompt = `Based on the following document, generate exactly ${count} multiple choice questions for a quiz game.\n\nFor each question provide 4 options (A,B,C,D) with only one correct answer. Keep questions clear and concise.\n\nDocument:\n${documentText.slice(0, 12000)}\n\nRespond in this exact JSON:\n{"questions":[{"id":1,"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A","explanation":"..."}]}`;

    try {
      const res = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an educational assistant. Respond only in valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });
      const content = res.choices[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON');
      return JSON.parse(match[0]).questions ?? [];
    } catch {
      throw new Error('Failed to generate questions from AI');
    }
  }

  extractText(filePath: string, originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    if (ext === '.txt') return buffer.toString('utf8');

    if (ext === '.pdf') {
      const content = buffer.toString('binary');
      let text = '';
      const streams = content.match(/stream\s*([\s\S]*?)\s*endstream/g) || [];
      for (const s of streams) {
        const inner = s.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
        (inner.match(/\((.*?)\)\s*Tj/gs) || []).forEach(m => { text += m.replace(/\((.*?)\)\s*Tj/s, '$1') + ' '; });
      }
      return text;
    }

    if (ext === '.docx') {
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(filePath);
        return zip.readAsText('word/document.xml').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
      } catch { return ''; }
    }

    return '';
  }
}
