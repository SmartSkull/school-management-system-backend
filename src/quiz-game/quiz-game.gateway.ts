import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
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
  roundStartedAt: number | null;
  roundTimer: NodeJS.Timeout | null;
}

function serializeRoom(r: Room) {
  return { id: r.id, hostName: r.hostName, subject: r.subject, playerCount: r.players.size, started: r.started, totalQuestions: r.questions.length };
}

type QuestionSeed = Omit<Question, 'id'>;

const QUESTION_BANK: Record<string, QuestionSeed[]> = {
  Mathematics: [
    { question: 'What is 15 × 8?', options: { A: '112', B: '120', C: '125', D: '130' }, correct_answer: 'B', explanation: '15 × 8 = 120' },
    { question: 'Solve: 2x + 6 = 14. What is x?', options: { A: '3', B: '4', C: '5', D: '6' }, correct_answer: 'B', explanation: '2x = 8, so x = 4' },
    { question: 'What is the square root of 144?', options: { A: '10', B: '11', C: '12', D: '14' }, correct_answer: 'C', explanation: '12 × 12 = 144' },
    { question: 'What is 25% of 200?', options: { A: '40', B: '50', C: '60', D: '75' }, correct_answer: 'B', explanation: '25% = 1/4, 200 ÷ 4 = 50' },
    { question: 'What is the area of a rectangle 7cm by 5cm?', options: { A: '24 cm²', B: '30 cm²', C: '35 cm²', D: '40 cm²' }, correct_answer: 'C', explanation: 'Area = length × width = 7 × 5 = 35 cm²' },
    { question: 'What is 3² + 4²?', options: { A: '14', B: '25', C: '49', D: '7' }, correct_answer: 'B', explanation: '9 + 16 = 25' },
    { question: 'Which of these is a prime number?', options: { A: '9', B: '15', C: '17', D: '21' }, correct_answer: 'C', explanation: '17 is only divisible by 1 and itself' },
    { question: 'What is 1/2 + 1/3?', options: { A: '2/5', B: '5/6', C: '2/6', D: '1/6' }, correct_answer: 'B', explanation: '3/6 + 2/6 = 5/6' },
    { question: 'How many sides does a hexagon have?', options: { A: '5', B: '6', C: '7', D: '8' }, correct_answer: 'B', explanation: 'A hexagon has 6 sides' },
    { question: 'What is the LCM of 4 and 6?', options: { A: '8', B: '10', C: '12', D: '24' }, correct_answer: 'C', explanation: 'LCM of 4 and 6 is 12' },
    { question: 'If a triangle has angles 60° and 80°, what is the third angle?', options: { A: '30°', B: '40°', C: '50°', D: '60°' }, correct_answer: 'B', explanation: '180 − 60 − 80 = 40°' },
    { question: 'What is 0.75 as a fraction?', options: { A: '1/4', B: '2/3', C: '3/4', D: '4/5' }, correct_answer: 'C', explanation: '0.75 = 75/100 = 3/4' },
    { question: 'What is the perimeter of a square with side 6cm?', options: { A: '12 cm', B: '18 cm', C: '24 cm', D: '36 cm' }, correct_answer: 'C', explanation: 'Perimeter = 4 × 6 = 24 cm' },
    { question: 'What is 7! (7 factorial)?', options: { A: '2520', B: '5040', C: '720', D: '40320' }, correct_answer: 'B', explanation: '7! = 7×6×5×4×3×2×1 = 5040' },
    { question: 'Simplify: 4(3x − 2)', options: { A: '7x − 2', B: '12x − 2', C: '12x − 8', D: '7x − 8' }, correct_answer: 'C', explanation: '4 × 3x = 12x, 4 × −2 = −8' },
  ],
  'English Language': [
    { question: 'Which of these is a synonym for "happy"?', options: { A: 'Sad', B: 'Joyful', C: 'Angry', D: 'Tired' }, correct_answer: 'B', explanation: '"Joyful" means feeling great happiness' },
    { question: 'Identify the noun in: "The dog barked loudly."', options: { A: 'barked', B: 'loudly', C: 'dog', D: 'The' }, correct_answer: 'C', explanation: '"Dog" is the noun — it names a thing' },
    { question: 'Which sentence uses the correct punctuation?', options: { A: 'She went to the market', B: 'She went to the market.', C: 'she went to the market.', D: 'She went, to the market' }, correct_answer: 'B', explanation: 'A sentence starts with a capital letter and ends with a full stop' },
    { question: 'What is the plural of "child"?', options: { A: 'Childs', B: 'Childes', C: 'Children', D: 'Childrens' }, correct_answer: 'C', explanation: 'The irregular plural of "child" is "children"' },
    { question: 'Which word is an antonym of "ancient"?', options: { A: 'Old', B: 'Modern', C: 'Historic', D: 'Aged' }, correct_answer: 'B', explanation: '"Modern" is the opposite of "ancient"' },
    { question: 'Choose the correct verb: "She ___ to school every day."', options: { A: 'go', B: 'goes', C: 'going', D: 'gone' }, correct_answer: 'B', explanation: 'Third-person singular uses "goes"' },
    { question: 'What is the past tense of "write"?', options: { A: 'Writed', B: 'Written', C: 'Wrote', D: 'Writes' }, correct_answer: 'C', explanation: 'The past tense of "write" is "wrote"' },
    { question: 'Which sentence is in passive voice?', options: { A: 'The cat chased the mouse', B: 'The mouse was chased by the cat', C: 'The cat is chasing the mouse', D: 'The mouse ran away' }, correct_answer: 'B', explanation: 'Passive voice: the subject receives the action' },
    { question: 'What figure of speech is: "The stars danced in the sky"?', options: { A: 'Simile', B: 'Alliteration', C: 'Personification', D: 'Metaphor' }, correct_answer: 'C', explanation: 'Giving human qualities (dancing) to non-human things is personification' },
    { question: 'Which word correctly completes the sentence: "Neither the boys nor the girl ___ ready."?', options: { A: 'are', B: 'were', C: 'is', D: 'have been' }, correct_answer: 'C', explanation: 'With "neither/nor", the verb agrees with the nearest subject ("girl" → "is")' },
    { question: 'What is the meaning of the prefix "un-" in "unhappy"?', options: { A: 'Very', B: 'Not', C: 'Again', D: 'Before' }, correct_answer: 'B', explanation: '"Un-" means "not" — unhappy = not happy' },
    { question: 'Which of these is a conjunction?', options: { A: 'Quickly', B: 'Because', C: 'Beautiful', D: 'Run' }, correct_answer: 'B', explanation: '"Because" joins clauses — it is a conjunction' },
    { question: 'Identify the adjective: "The tall boy won the race."', options: { A: 'boy', B: 'won', C: 'tall', D: 'race' }, correct_answer: 'C', explanation: '"Tall" describes the boy — it is an adjective' },
    { question: 'What punctuation mark ends a question?', options: { A: 'Full stop', B: 'Exclamation mark', C: 'Comma', D: 'Question mark' }, correct_answer: 'D', explanation: 'Questions end with a question mark (?)' },
    { question: 'Which word is spelled correctly?', options: { A: 'Recieve', B: 'Receive', C: 'Receve', D: 'Recive' }, correct_answer: 'B', explanation: '"Receive" — remember "i before e except after c"' },
  ],
  'Basic Science': [
    { question: 'What gas do plants absorb during photosynthesis?', options: { A: 'Oxygen', B: 'Nitrogen', C: 'Carbon dioxide', D: 'Hydrogen' }, correct_answer: 'C', explanation: 'Plants absorb CO₂ and release oxygen during photosynthesis' },
    { question: 'What is the chemical symbol for water?', options: { A: 'WO', B: 'H₂O', C: 'HO₂', D: 'W₂O' }, correct_answer: 'B', explanation: 'Water is made of 2 hydrogen atoms and 1 oxygen atom' },
    { question: 'Which organ pumps blood around the body?', options: { A: 'Liver', B: 'Lung', C: 'Kidney', D: 'Heart' }, correct_answer: 'D', explanation: 'The heart pumps blood through the circulatory system' },
    { question: 'What is the unit of electric current?', options: { A: 'Volt', B: 'Watt', C: 'Ampere', D: 'Ohm' }, correct_answer: 'C', explanation: 'Electric current is measured in Amperes (A)' },
    { question: 'Which planet is closest to the Sun?', options: { A: 'Venus', B: 'Earth', C: 'Mars', D: 'Mercury' }, correct_answer: 'D', explanation: 'Mercury is the closest planet to the Sun' },
    { question: 'What is the process by which water turns into vapour?', options: { A: 'Condensation', B: 'Evaporation', C: 'Precipitation', D: 'Transpiration' }, correct_answer: 'B', explanation: 'Evaporation is liquid water turning into water vapour' },
    { question: 'What type of animal is a whale?', options: { A: 'Fish', B: 'Reptile', C: 'Mammal', D: 'Amphibian' }, correct_answer: 'C', explanation: 'Whales are mammals — they breathe air and nurse young with milk' },
    { question: 'What is the hardest natural substance on Earth?', options: { A: 'Iron', B: 'Gold', C: 'Diamond', D: 'Granite' }, correct_answer: 'C', explanation: 'Diamond scores 10 on the Mohs hardness scale' },
    { question: 'How many bones are in the adult human body?', options: { A: '186', B: '206', C: '216', D: '226' }, correct_answer: 'B', explanation: 'An adult human has 206 bones' },
    { question: 'Which force pulls objects toward the Earth?', options: { A: 'Magnetism', B: 'Friction', C: 'Gravity', D: 'Tension' }, correct_answer: 'C', explanation: 'Gravity is the force that attracts objects toward the Earth' },
  ],
  'Social Studies': [
    { question: 'What is the capital of Nigeria?', options: { A: 'Lagos', B: 'Kano', C: 'Abuja', D: 'Ibadan' }, correct_answer: 'C', explanation: 'Abuja became the capital of Nigeria in 1991' },
    { question: 'What does "democracy" mean?', options: { A: 'Rule by the military', B: 'Rule by the people', C: 'Rule by one person', D: 'Rule by religion' }, correct_answer: 'B', explanation: 'Democracy comes from Greek: "demos" (people) + "kratos" (rule)' },
    { question: 'Which of these is a fundamental human right?', options: { A: 'Right to own a car', B: 'Right to free speech', C: 'Right to have a pet', D: 'Right to win elections' }, correct_answer: 'B', explanation: 'Freedom of speech is a fundamental human right' },
    { question: 'What is the full meaning of UNO?', options: { A: 'United Nations Organisation', B: 'Universal Nations Order', C: 'United Nations Office', D: 'United National Organisation' }, correct_answer: 'A', explanation: 'UNO stands for United Nations Organisation' },
    { question: 'How many states are in Nigeria?', options: { A: '30', B: '34', C: '36', D: '38' }, correct_answer: 'C', explanation: 'Nigeria has 36 states and the FCT' },
    { question: 'What is the primary role of the government?', options: { A: 'Making profit', B: 'Protecting citizens and providing services', C: 'Controlling businesses', D: 'Collecting taxes only' }, correct_answer: 'B', explanation: 'Governments exist to protect citizens and provide essential services' },
    { question: 'Which institution makes laws in Nigeria?', options: { A: 'Supreme Court', B: 'Police Force', C: 'National Assembly', D: 'Central Bank' }, correct_answer: 'C', explanation: 'The National Assembly (Senate and House of Representatives) makes laws' },
    { question: 'What does "culture" refer to?', options: { A: 'The weather of a place', B: 'The beliefs, customs and way of life of a people', C: 'The geography of a region', D: 'The economy of a country' }, correct_answer: 'B', explanation: 'Culture includes language, traditions, art, and beliefs of a group' },
    { question: 'Which of these is an example of a civic duty?', options: { A: 'Sleeping', B: 'Voting in elections', C: 'Watching TV', D: 'Going shopping' }, correct_answer: 'B', explanation: 'Voting is a civic duty and responsibility of citizens' },
    { question: 'What is the significance of October 1 in Nigeria?', options: { A: 'Democracy Day', B: 'Children\'s Day', C: 'Independence Day', D: 'Workers\' Day' }, correct_answer: 'C', explanation: 'Nigeria gained independence on October 1, 1960' },
  ],
  'Civic Education': [
    { question: 'What does citizenship mean?', options: { A: 'Living in a city', B: 'Legal membership of a country', C: 'Working for the government', D: 'Paying taxes' }, correct_answer: 'B', explanation: 'Citizenship is the legal status of being a member of a country' },
    { question: 'Which of these is a right of a Nigerian citizen?', options: { A: 'Right to break the law', B: 'Right to fair hearing', C: 'Right to avoid taxes', D: 'Right to own all public property' }, correct_answer: 'B', explanation: 'The right to fair hearing is guaranteed in the Nigerian Constitution' },
    { question: 'What is corruption?', options: { A: 'Working hard for your country', B: 'Dishonest conduct by those in power', C: 'Paying your taxes on time', D: 'Obeying the constitution' }, correct_answer: 'B', explanation: 'Corruption is the abuse of entrusted power for private gain' },
    { question: 'What is the rule of law?', options: { A: 'Only lawyers have rights', B: 'The government can do anything', C: 'Everyone is equal before the law', D: 'Laws only apply to poor people' }, correct_answer: 'C', explanation: 'The rule of law means all people and institutions are subject to the same laws' },
    { question: 'What body promotes human rights in Nigeria?', options: { A: 'NAFDAC', B: 'EFCC', C: 'NHRC', D: 'INEC' }, correct_answer: 'C', explanation: 'NHRC stands for National Human Rights Commission' },
  ],
  'Agricultural Science': [
    { question: 'Which of these is a cash crop in Nigeria?', options: { A: 'Cassava', B: 'Cocoa', C: 'Yam', D: 'Maize' }, correct_answer: 'B', explanation: 'Cocoa is grown primarily for export — it is a cash crop' },
    { question: 'What is crop rotation?', options: { A: 'Planting the same crop every year', B: 'Growing different crops in the same field in successive seasons', C: 'Rotating machinery on a farm', D: 'Moving crops from one farm to another' }, correct_answer: 'B', explanation: 'Crop rotation prevents soil depletion and reduces pests' },
    { question: 'Which soil type is best for agriculture?', options: { A: 'Sandy soil', B: 'Clay soil', C: 'Loamy soil', D: 'Rocky soil' }, correct_answer: 'C', explanation: 'Loamy soil has the right balance of sand, silt, and clay for plant growth' },
    { question: 'What is the function of NPK fertiliser?', options: { A: 'Kill pests', B: 'Supply nitrogen, phosphorus, and potassium to crops', C: 'Water the crops', D: 'Prevent weeds' }, correct_answer: 'B', explanation: 'NPK provides the three main nutrients crops need to grow' },
    { question: 'What is photosynthesis in plants?', options: { A: 'Plants absorbing water from soil', B: 'Plants making food using sunlight, CO₂ and water', C: 'Plants releasing CO₂ at night', D: 'Plants absorbing nutrients from fertiliser' }, correct_answer: 'B', explanation: 'Photosynthesis converts sunlight, CO₂ and water into glucose and oxygen' },
    { question: 'Which of these is a pest of stored grain?', options: { A: 'Earthworm', B: 'Weevil', C: 'Butterfly', D: 'Bee' }, correct_answer: 'B', explanation: 'Weevils are common pests that damage stored grains' },
    { question: 'What is irrigation?', options: { A: 'The removal of weeds', B: 'Artificial supply of water to crops', C: 'The use of pesticides', D: 'Ploughing the land' }, correct_answer: 'B', explanation: 'Irrigation is the controlled supply of water to farmland' },
    { question: 'Which animal is a ruminant?', options: { A: 'Pig', B: 'Chicken', C: 'Cow', D: 'Dog' }, correct_answer: 'C', explanation: 'Cows are ruminants — they have multi-chambered stomachs and chew cud' },
    { question: 'What is the purpose of weeding?', options: { A: 'To water crops', B: 'To remove unwanted plants that compete with crops', C: 'To add nutrients to soil', D: 'To protect crops from sun' }, correct_answer: 'B', explanation: 'Weeds compete with crops for nutrients, water, and light' },
    { question: 'Which of these is a legume?', options: { A: 'Maize', B: 'Groundnut', C: 'Cassava', D: 'Plantain' }, correct_answer: 'B', explanation: 'Groundnut (peanut) is a legume — it fixes nitrogen in the soil' },
  ],
  'Computer Studies': [
    { question: 'What does CPU stand for?', options: { A: 'Central Processing Unit', B: 'Computer Processing Unit', C: 'Central Program Unit', D: 'Core Processing Unit' }, correct_answer: 'A', explanation: 'CPU stands for Central Processing Unit — the brain of the computer' },
    { question: 'Which of these is an input device?', options: { A: 'Monitor', B: 'Printer', C: 'Keyboard', D: 'Speaker' }, correct_answer: 'C', explanation: 'A keyboard is used to enter data into the computer — it is an input device' },
    { question: 'What does RAM stand for?', options: { A: 'Random Access Memory', B: 'Read Access Memory', C: 'Random Application Module', D: 'Read Application Memory' }, correct_answer: 'A', explanation: 'RAM is temporary memory the computer uses while running programs' },
    { question: 'Which of these is a web browser?', options: { A: 'Microsoft Word', B: 'Google Chrome', C: 'VLC Media Player', D: 'Photoshop' }, correct_answer: 'B', explanation: 'Google Chrome is a web browser used to access the internet' },
    { question: 'What does "www" stand for in a web address?', options: { A: 'World Wide Web', B: 'Wide World Web', C: 'World Web Wide', D: 'Web World Wide' }, correct_answer: 'A', explanation: 'WWW stands for World Wide Web' },
    { question: 'What is the function of a modem?', options: { A: 'Store files permanently', B: 'Connect a computer to the internet via telephone lines', C: 'Display images on screen', D: 'Print documents' }, correct_answer: 'B', explanation: 'A modem modulates and demodulates signals to enable internet connectivity' },
    { question: 'Which file extension is used for images?', options: { A: '.mp3', B: '.doc', C: '.jpg', D: '.exe' }, correct_answer: 'C', explanation: '.jpg (JPEG) is a common image file format' },
    { question: 'What does the term "software" refer to?', options: { A: 'Physical parts of a computer', B: 'Programs and operating information used by a computer', C: 'The computer screen', D: 'The computer casing' }, correct_answer: 'B', explanation: 'Software is the set of programs and data that instruct the hardware' },
    { question: 'Which of these is an operating system?', options: { A: 'Microsoft Excel', B: 'Google Chrome', C: 'Windows 11', D: 'Adobe Acrobat' }, correct_answer: 'C', explanation: 'Windows 11 is an operating system that manages computer hardware and software' },
    { question: 'What is a computer virus?', options: { A: 'A helpful program that speeds up computers', B: 'A malicious program that damages or disrupts a computer', C: 'A type of antivirus software', D: 'A hardware component' }, correct_answer: 'B', explanation: 'A computer virus is malicious software that can corrupt files and systems' },
  ],
};

@WebSocketGateway({ namespace: '/quiz-game', cors: { origin: '*' } })
export class QuizGameGateway implements OnGatewayDisconnect {
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
      roundStartedAt: null,
      roundTimer: null,
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
    room.players.set(client.id, { id: client.id, name: data.playerName, score: 0 });
    client.join(data.roomId);
    this.server.to(data.roomId).emit('room-update', { players: [...room.players.values()] });
    client.emit('room-joined', { roomId: data.roomId, players: [...room.players.values()] });
    this.broadcastLobby(room.schoolId);

    // Catch up late joiners with the current question and remaining time
    if (room.started && room.roundActive && room.roundStartedAt !== null) {
      const elapsed = Math.floor((Date.now() - room.roundStartedAt) / 1000);
      const remaining = Math.max(0, 20 - elapsed);
      const q = room.questions[room.questionIndex];
      client.emit('question', {
        question: q.question,
        options: q.options,
        questionIndex: room.questionIndex,
        totalQuestions: room.questions.length,
        timeLeft: remaining,
      });
    }
  }

  @SubscribeMessage('start-game')
  handleStartGame(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.rooms.get(data.roomId);
    if (!room) { client.emit('error', { message: 'Room not found' }); return; }
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

    if (data.answer.toUpperCase() === q.correct_answer.toUpperCase()) {
      room.roundActive = false;
      clearTimeout(room.roundTimer!);
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

  private sendQuestion(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const q = room.questions[room.questionIndex];
    room.roundStartedAt = Date.now();
    room.roundActive = true;
    this.server.to(roomId).emit('question', {
      question: q.question,
      options: q.options,
      questionIndex: room.questionIndex,
      totalQuestions: room.questions.length,
      timeLeft: 20,
    });
    // Server owns the 20s timer — no client can trigger this
    room.roundTimer = setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r || !r.roundActive) return;
      r.roundActive = false;
      this.server.to(roomId).emit('round-result', {
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        winner: null,
        players: [...r.players.values()],
      });
      this.scheduleNextQuestion(roomId);
    }, 20000);
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
        this.sendQuestion(roomId);
      }
    }, 5000);
  }

  async generateQuestionsForSubject(subject: string, numQuestions = 10): Promise<Question[]> {
    const bank = QUESTION_BANK[subject] ?? QUESTION_BANK['Mathematics'];
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(numQuestions, shuffled.length)).map((q, i) => ({ ...q, id: i + 1 }));
  }

  // HTTP-style: generate questions from uploaded text (called from controller)
  async generateQuestions(documentText: string, numQuestions = 8): Promise<Question[]> {
    return this.generateQuestionsForSubject('Mathematics', numQuestions);
  }

  async extractText(filePath: string, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    if (ext === '.txt') return buffer.toString('utf8');

    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text ?? '';
      } catch { return ''; }
    }

    if (ext === '.docx') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value ?? '';
      } catch (e) {
        console.error('mammoth error:', e);
        return '';
      }
    }

    return '';
  }
}
