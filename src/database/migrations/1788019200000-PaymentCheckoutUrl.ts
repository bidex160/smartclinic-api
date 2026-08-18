import { MigrationInterface, QueryRunner } from 'typeorm';
export class PaymentCheckoutUrl1788019200000 implements MigrationInterface{name='PaymentCheckoutUrl1788019200000';async up(q:QueryRunner){await q.query(`ALTER TABLE "payment_attempts" ADD "checkout_url" text`);}async down(q:QueryRunner){await q.query(`ALTER TABLE "payment_attempts" DROP COLUMN "checkout_url"`);}}
