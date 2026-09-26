import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
} from 'typeorm';

export class AddDiagnosticOrderItemResultFields1794931300000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns(
      'clinical_diagnostic_order_items',
      [
        new TableColumn({
          name: 'result_text',
          type: 'text',
          isNullable: true,
        }),
        new TableColumn({
          name: 'result_value',
          type: 'varchar',
          length: '120',
          isNullable: true,
        }),
        new TableColumn({
          name: 'result_unit',
          type: 'varchar',
          length: '80',
          isNullable: true,
        }),
        new TableColumn({
          name: 'reference_range',
          type: 'varchar',
          length: '160',
          isNullable: true,
        }),
        new TableColumn({
          name: 'result_flag',
          type: 'varchar',
          length: '40',
          isNullable: true,
        }),
        new TableColumn({
          name: 'resulted_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns(
      'clinical_diagnostic_order_items',
      [
        'result_text',
        'result_value',
        'result_unit',
        'reference_range',
        'result_flag',
        'resulted_at',
      ],
    );
  }
}