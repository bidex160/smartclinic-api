import { ApiProperty } from '@nestjs/swagger'; import { IsString, MaxLength, MinLength } from 'class-validator';
export class InitiatePaymentDto { @ApiProperty({ minLength: 8, maxLength: 100 }) @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string; }
