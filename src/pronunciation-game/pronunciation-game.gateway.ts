import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface Player {
  id: string;
  name: string;
  score: number;
}

interface Room {
  id: string;
  schoolId: string;
  difficulty: string;
  hostName: string;
  players: Map<string, Player>;
  wordIndex: number;
  words: string[];
  started: boolean;
  roundActive: boolean;
  submissions: Map<string, { transcript: string; submittedAt: number }>;
}

const WORD_LISTS: Record<string, string[]> = {
  beginner: ['apple', 'chair', 'table', 'water', 'light', 'house', 'green', 'happy', 'music', 'dance'],
  intermediate: ['beautiful', 'adventure', 'knowledge', 'chocolate', 'schedule', 'hierarchy', 'necessary', 'temperature', 'vocabulary', 'pronunciation'],
  advanced: ['entrepreneurship', 'conscientious', 'pharmaceutical', 'ubiquitous', 'onomatopoeia', 'particularly', 'infrastructure', 'authentication', 'enthusiastic', 'revolutionary'],
};

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 100;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return Math.round((matches / longer.length) * 100);
}

function serializeRoom(room: Room) {
  return {
    id: room.id,
    difficulty: room.difficulty,
    hostName: room.hostName,
    playerCount: room.players.size,
    started: room.started,
  };
}

@WebSocketGateway({ namespace: '/pronunciation-game', cors: { origin: '*' } })
export class PronunciationGameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private rooms = new Map<string, Room>();

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
    @MessageBody() data: { schoolId: string; playerName: string; difficulty?: string },
  ) {
    const { schoolId, playerName, difficulty = 'beginner' } = data;
    const roomId = `${schoolId}-${Date.now()}`;
    this.rooms.set(roomId, {
      id: roomId,
      schoolId,
      difficulty,
      hostName: playerName,
      players: new Map([[client.id, { id: client.id, name: playerName, score: 0 }]]),
      wordIndex: 0,
      words: [...WORD_LISTS[difficulty] || WORD_LISTS.beginner].sort(() => Math.random() - 0.5),
      started: false,
      roundActive: false,
      submissions: new Map(),
    });
    client.join(roomId);
    client.emit('room-joined', { roomId, players: [{ id: client.id, name: playerName, score: 0 }] });
    this.broadcastLobby(schoolId);
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
    if (!room || room.players.size < 2) {
      client.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }
    room.started = true;
    room.roundActive = true;
    this.broadcastLobby(room.schoolId);
    this.server.to(data.roomId).emit('game-started', {
      word: room.words[room.wordIndex],
      wordIndex: room.wordIndex,
      totalWords: room.words.length,
    });
  }

  @SubscribeMessage('submit-transcript')
  handleSubmitTranscript(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; transcript: string },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room || !room.roundActive) return;
    room.submissions.set(client.id, { transcript: data.transcript, submittedAt: Date.now() });
    this.server.to(data.roomId).emit('player-submitted', { playerId: client.id });
    if (room.submissions.size >= room.players.size) this.evaluateRound(data.roomId);
  }

  private evaluateRound(roomId: string) {
    const room = this.rooms.get(roomId)!;
    const currentWord = room.words[room.wordIndex];
    room.roundActive = false;

    const entries = [...room.submissions.entries()].sort((a, b) => a[1].submittedAt - b[1].submittedAt);
    const results: Array<{ playerId: string; name: string; transcript: string; score: number; accuracy: number; rank: number }> = [];

    let winner = '';
    let winnerFound = false;
    entries.forEach(([playerId, { transcript }], rank) => {
      const player = room.players.get(playerId)!;
      const accuracy = similarity(transcript, currentWord);
      if (!winnerFound && accuracy >= 70) {
        player.score += 1;
        winnerFound = true;
        winner = player.name;
      }
      results.push({ playerId, name: player.name, transcript, score: player.score, accuracy, rank: rank + 1 });
    });
    room.submissions.clear();

    const hasMore = room.wordIndex + 1 < room.words.length;
    this.server.to(roomId).emit('round-result', { word: currentWord, results, winner, players: [...room.players.values()] });

    if (hasMore) {
      setTimeout(() => {
        room.wordIndex++;
        room.roundActive = true;
        this.server.to(roomId).emit('next-word', {
          word: room.words[room.wordIndex],
          wordIndex: room.wordIndex,
          totalWords: room.words.length,
        });
      }, 4000);
    } else {
      const sorted = [...room.players.values()].sort((a, b) => b.score - a.score);
      this.server.to(roomId).emit('game-over', { players: sorted });
      this.rooms.delete(roomId);
    }
  }
}
