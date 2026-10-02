import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PaymentProvider } from '../../payments/enums/payment-provider.enum';

export class HospitalBillPaymentItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) itemReference!: string;
}

export class CreateHospitalBillPaymentDto {
  @ApiProperty({ example: 'AKTH' }) @IsString() @IsNotEmpty() @MaxLength(40) hospitalCode!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) invoiceReference!: string;
  @ApiProperty({ type: [HospitalBillPaymentItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => HospitalBillPaymentItemDto) items!: HospitalBillPaymentItemDto[];
  @ApiPropertyOptional({ enum: PaymentProvider }) @IsOptional() @IsEnum(PaymentProvider) paymentProvider?: PaymentProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(254) paymentEmail?: string;
}
