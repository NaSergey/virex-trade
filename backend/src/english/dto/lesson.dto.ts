import { IsBoolean } from 'class-validator';

/** Тело `PUT /api/admin/english/lessons/:lessonId` — отметка «пройден». */
export class LessonDto {
  @IsBoolean()
  done!: boolean;
}
