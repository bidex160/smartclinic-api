import { WhatsAppInboundFoundation1794412800000 } from './migrations/1794412800000-WhatsAppInboundFoundation';

describe('WhatsApp inbound foundation migration', () => {
  it('creates only focused identity/message schema with deduplication and nullable account links', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (statement: string) => { sql.push(statement); }) };
    await new WhatsAppInboundFoundation1794412800000().up(runner as never);
    const joined = sql.join('\n');
    expect(joined).toContain('CREATE TABLE "whatsapp_identities"');
    expect(joined).toContain('"user_id" uuid,'); expect(joined).toContain('"patient_id" uuid,');
    expect(joined).toContain('CREATE TABLE "whatsapp_messages"');
    expect(joined).toContain('UQ_whatsapp_messages_provider_message');
    expect(joined).not.toMatch(/ALTER TABLE "(users|patients)"/);
  });

  it('drops only the WhatsApp schema on rollback', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (statement: string) => { sql.push(statement); }) };
    await new WhatsAppInboundFoundation1794412800000().down(runner as never);
    expect(sql.join('\n')).toContain('DROP TABLE "whatsapp_messages"'); expect(sql.join('\n')).toContain('DROP TABLE "whatsapp_identities"');
  });
});
