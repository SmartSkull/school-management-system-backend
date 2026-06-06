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
  transcript: string;
  score: number;
}

interface Room {
  id: string;
  players: Map<string, Player>;
  wordIndex: number;
  words: string[];
  started: boolean;
  roundActive: boolean;
  submissions: Map<string, { transcript: string; submittedAt: number }>; // socketId -> {transcript, timestamp}
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
  // Simple character overlap score
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return Math.round((matches / longer.length) * 100);
}

@WebSocketGateway({ namespace: '/pronunciation-game', cors: { origin: '*' } })
export class PronunciationGameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private rooms = new Map<string, Room>();

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.rooms.forEach((room, roomId) => {
      if (room.players.has(client.id)) {
        room.players.delete(client.id);
        this.server.to(roomId).emit('player-left', {
          playerId: client.id,
          players: [...room.players.values()],
        });
        if (room.players.size === 0) this.rooms.delete(roomId);
      }
    });
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerName: string; difficulty?: string },
  ) {
    const { roomId, playerName, difficulty = 'beginner' } = data;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        wordIndex: 0,
        words: [...WORD_LISTS[difficulty] || WORD_LISTS.beginner].sort(() => Math.random() - 0.5),
        started: false,
        roundActive: false,
        submissions: new Map(),
      });
    }

    const room = this.rooms.get(roomId)!;
    if (room.started) {
      client.emit('error', { message: 'Game already started' });
      return;
    }

    room.players.set(client.id, { id: client.id, name: playerName, transcript: '', score: 0 });
    client.join(roomId);

    this.server.to(roomId).emit('room-update', {
      players: [...room.players.values()],
      wordIndex: room.wordIndex,
      totalWords: room.words.length,
    });
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

    const currentWord = room.words[room.wordIndex];
    room.submissions.set(client.id, { transcript: data.transcript, submittedAt: Date.now() });

    // Notify others that this player submitted
    this.server.to(data.roomId).emit('player-submitted', { playerId: client.id });

    // If all players submitted, evaluate
    if (room.submissions.size >= room.players.size) {
      this.evaluateRound(data.roomId);
    }
  }

  private evaluateRound(roomId: string) {
    const room = this.rooms.get(roomId)!;
    const currentWord = room.words[room.wordIndex];
    room.roundActive = false;

    // Build results sorted by submission time (fastest first)
    const entries = [...room.submissions.entries()]
      .sort((a, b) => a[1].submittedAt - b[1].submittedAt);

    const results: Array<{ playerId: string; name: string; transcript: string; score: number; accuracy: number; rank: number }> = [];

    // Find fastest player with accuracy >= 70
    let winnerFound = false;
    let winner = '';

    entries.forEach(([playerId, { transcript }], rank) => {
      const player = room.players.get(playerId)!;
      const accuracy = similarity(transcript, currentWord);

      // Only the fastest accurate player gets a point
      if (!winnerFound && accuracy >= 70) {
        player.score += 1;
        winnerFound = true;
        winner = player.name;
      }

      results.push({ playerId, name: player.name, transcript, score: player.score, accuracy, rank: rank + 1 });
    });

    room.submissions.clear();

    const hasMore = room.wordIndex + 1 < room.words.length;
    this.server.to(roomId).emit('round-result', {
      word: currentWord,
      results,
      winner,
      players: [...room.players.values()],
    });

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
      // Final scores
      const sortedPlayers = [...room.players.values()].sort((a, b) => b.score - a.score);
      this.server.to(roomId).emit('game-over', { players: sortedPlayers });
      this.rooms.delete(roomId);
    }
  }
}
