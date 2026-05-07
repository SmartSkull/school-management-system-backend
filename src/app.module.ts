import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { StaffModule } from './staff/staff.module';
import { StudentModule } from './student/student.module';
import { PostsModule } from './posts/posts.module';
import { MessagesModule } from './messages/messages.module';
import { CbtModule } from './cbt/cbt.module';
import { BookgameModule } from './bookgame/bookgame.module';
import { PublicModule } from './public/public.module';
import { SchoolFeesModule } from './school-fees/school-fees.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AdminModule,
    StaffModule,
    StudentModule,
    PostsModule,
    MessagesModule,
    CbtModule,
    BookgameModule,
    PublicModule,
    SchoolFeesModule,
  ],
})
export class AppModule {}
