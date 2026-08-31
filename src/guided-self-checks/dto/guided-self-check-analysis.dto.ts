import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GuidedSelfCheckAnalysisStatus } from '../enums/guided-self-check-analysis.enum';

export class GuidedSelfCheckAnalysisListQueryDto {
  @IsOptional()
  @IsEnum(GuidedSelfCheckAnalysisStatus)
  status?: GuidedSelfCheckAnalysisStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
