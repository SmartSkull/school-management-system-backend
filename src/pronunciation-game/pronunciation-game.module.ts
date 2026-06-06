import { Module } from '@nestjs/common';
import { PronunciationGameGateway } from './pronunciation-game.gateway';

@Module({ providers: [PronunciationGameGateway] })
export class PronunciationGameModule {}
