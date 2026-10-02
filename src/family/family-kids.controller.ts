import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsTimeZone, Matches, Max, MaxLength, Min } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { FamilyKidsService } from './family-kids.service';
import { KID_TASKS } from './kids.content';

const CHILD_REF = /^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export class TimezoneQueryDto {
  @ApiPropertyOptional({ example: 'Africa/Lagos' }) @IsOptional() @IsTimeZone() timezone?: string;
}
export class ChildRefParamDto {
  @ApiProperty({ example: 'SCP-AB12-CD34' }) @Matches(CHILD_REF) ref!: string;
}
export class AddKidTaskDto {
  @ApiProperty({ enum: KID_TASKS }) @IsIn(KID_TASKS as unknown as string[]) taskKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
}
export class KidTaskActionDto {
  @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
}
export class KidQuizAnswerDto {
  @ApiProperty() @IsString() @MaxLength(20) questionId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(2) choiceIndex!: number;
  @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
}

@ApiTags('My family: kids corner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('me/family')
export class FamilyKidsController {
  constructor(private readonly kids: FamilyKidsService) {}

  @Get()
  @ApiOperation({ summary: 'Family streak and each child’s tasks, stars, question and next check-up' })
  overview(@Req() r: { user: User }, @Query() q: TimezoneQueryDto) {
    return this.kids.overview(r.user, q.timezone);
  }

  @Get('kids/:ref')
  child(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Query() q: TimezoneQueryDto) {
    return this.kids.child(r.user, p.ref, q.timezone);
  }

  @Post('kids/:ref/tasks')
  @ApiOperation({ summary: 'Add a daily task for a child (guardian only)' })
  addTask(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Body() dto: AddKidTaskDto) {
    return this.kids.addTask(r.user, p.ref, dto.taskKey, dto.timezone);
  }

  @Delete('kids/:ref/tasks/:taskId')
  removeTask(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Param('taskId', ParseUUIDPipe) taskId: string, @Query() q: TimezoneQueryDto) {
    return this.kids.removeTask(r.user, p.ref, taskId, q.timezone);
  }

  @Post('kids/:ref/tasks/:taskId/done')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a task done today: one star' })
  done(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: KidTaskActionDto) {
    return this.kids.completeTask(r.user, p.ref, taskId, dto.timezone);
  }

  @Delete('kids/:ref/tasks/:taskId/done')
  undo(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Param('taskId', ParseUUIDPipe) taskId: string, @Query() q: TimezoneQueryDto) {
    return this.kids.undoTask(r.user, p.ref, taskId, q.timezone);
  }

  @Post('kids/:ref/quiz/answers')
  @HttpCode(HttpStatus.OK)
  answer(@Req() r: { user: User }, @Param() p: ChildRefParamDto, @Body() dto: KidQuizAnswerDto) {
    return this.kids.answerQuiz(r.user, p.ref, dto);
  }
}
