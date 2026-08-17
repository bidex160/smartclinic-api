import { IsUUID } from 'class-validator';
export class PackagePriceIdParamsDto { @IsUUID() id!: string; }
