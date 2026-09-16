export interface NotificationResponseDto {
  reference: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityReference: string;
  actionType: string;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

