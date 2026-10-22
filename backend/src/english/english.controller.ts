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
import { PhraseDto } from './dto/phrase.dto';
import { ThemeDto, ThemeWordDto } from './dto/theme.dto';

/** id из адреса: слово владельца или раздел курса. */
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

  /** PUT /api/admin/english/cards — состояние карточки после ответа (id — в теле). */
  @Put('cards')
  saveCard(@Body() dto: CardStateDto) {
    return this.english.saveCard(dto);
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

  /** POST /api/admin/english/phrases — фраза диктанта или произношения сделана. */
  @Post('phrases')
  phrase(@Body() dto: PhraseDto) {
    return this.english.phrase(dto.day);
  }

  /** POST /api/admin/english/quiz — ответ в тесте по теме слов (тело — `{ day }`). */
  @Post('quiz')
  quiz(@Body() dto: PhraseDto) {
    return this.english.quiz(dto.day);
  }

  /** POST /api/admin/english/themes — своя тема. */
  @Post('themes')
  addTheme(@Body() dto: ThemeDto) {
    return this.english.addTheme(dto.title);
  }

  /** DELETE /api/admin/english/themes/<id> — удалить тему (слова остаются). */
  @Delete('themes/:id')
  deleteTheme(@Param('id') id: string) {
    return this.english.deleteTheme(idParam(id));
  }

  /** PUT /api/admin/english/themes/<id>/words — слово в тему или из неё (id карточки — в теле). */
  @Put('themes/:id/words')
  setThemeWord(@Param('id') id: string, @Body() dto: ThemeWordDto) {
    return this.english.setThemeWord(idParam(id), dto.cardId, dto.on);
  }
}
