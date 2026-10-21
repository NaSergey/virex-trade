import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { EnglishService } from './english.service';
import { CardStateDto } from './dto/card-state.dto';
import { WordDto } from './dto/word.dto';
import { LessonDto } from './dto/lesson.dto';
import { AnswerDto } from './dto/answer.dto';

/** id из адреса: id карточки — `<раздел>:<слово>`, слово книги бывает фразой. */
function idParam(value: string): string {
  if (!value || value.length > 120) throw new BadRequestException('Bad id');
  return value;
}

/**
 * Учебник английского — раздел владельца на поддомене админки. Под тем же
 * двойным guard'ом, что кошельки и аналитика; префикс `/api/admin` держит эти
 * запросы вне учёта посещений.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/english')
export class EnglishController {
  constructor(private readonly english: EnglishService) {}

  /** GET /api/admin/english/state — карточки, свои слова, уроки и ответы разом. */
  @Get('state')
  state() {
    return this.english.state();
  }

  /** PUT /api/admin/english/cards/<id> — состояние карточки после ответа. */
  @Put('cards/:cardId')
  saveCard(@Param('cardId') cardId: string, @Body() dto: CardStateDto) {
    return this.english.saveCard(idParam(cardId), dto);
  }

  /** POST /api/admin/english/words — добавить своё слово. */
  @Post('words')
  addWord(@Body() dto: WordDto) {
    return this.english.addWord(dto);
  }

  /** DELETE /api/admin/english/words/<id> — удалить своё слово с его карточкой. */
  @Delete('words/:id')
  deleteWord(@Param('id') id: string) {
    return this.english.deleteWord(idParam(id));
  }

  /** PUT /api/admin/english/lessons/<id> — отметить раздел пройденным или снять. */
  @Put('lessons/:lessonId')
  setLesson(@Param('lessonId') lessonId: string, @Body() dto: LessonDto) {
    return this.english.setLesson(idParam(lessonId), dto.done);
  }

  /** POST /api/admin/english/answers — ответ на упражнение. */
  @Post('answers')
  answer(@Body() dto: AnswerDto) {
    return this.english.answer(dto);
  }
}
