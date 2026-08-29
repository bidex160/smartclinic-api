import { CareChatAttachments1790784000000 } from './migrations/1790784000000-CareChatAttachments';
describe('CareChatAttachments migration', () => {
  it('adds nullable message text and constrained pending/bound private attachments', async () => {
    const sql: string[] = []; await new CareChatAttachments1790784000000().up({ query: jest.fn(async statement => sql.push(statement)) } as never);
    expect(sql).toContainEqual(expect.stringContaining('ALTER COLUMN "body" DROP NOT NULL'));
    expect(sql).toContainEqual(expect.stringContaining('CREATE TABLE "care_message_attachments"'));
    expect(sql).toContainEqual(expect.stringContaining('CHK_care_message_attachments_binding'));
    expect(sql).toContainEqual(expect.stringContaining('UQ_care_message_attachments_reference'));
    expect(sql).toContainEqual(expect.stringContaining('IDX_care_message_attachments_pending'));
  });
});
