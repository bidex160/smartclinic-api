import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { GuidedSelfCheckContactWorkItemListQueryDto } from "./dto/guided-self-check-contact-work-item.dto";
import { GuidedSelfCheckClassificationResult } from "./entities/guided-self-check-classification.entity";
import { GuidedSelfCheckContactWorkItem } from "./entities/guided-self-check-contact-work-item.entity";
import { GuidedSelfCheckHistory } from "./entities/guided-self-check-history.entity";
import { GuidedSelfCheckNextAction } from "./entities/guided-self-check-next-action.entity";
import {
  GuidedSelfCheckContactWorkItemOutcome,
  GuidedSelfCheckContactWorkItemStatus,
} from "./enums/guided-self-check-contact-work-item.enum";
import { GuidedSelfCheckClassification } from "./enums/guided-self-check-classification.enum";
import { GuidedSelfCheckNextActionType } from "./enums/guided-self-check-next-action.enum";
import { GuidedSelfCheckReviewPriority } from "./enums/guided-self-check-review.enum";

const ACTIVE = [
  GuidedSelfCheckContactWorkItemStatus.PENDING,
  GuidedSelfCheckContactWorkItemStatus.ACKNOWLEDGED,
  GuidedSelfCheckContactWorkItemStatus.IN_PROGRESS,
];
@Injectable()
export class GuidedSelfCheckContactWorkItemsService {
  constructor(
    @InjectRepository(GuidedSelfCheckContactWorkItem)
    private items: Repository<GuidedSelfCheckContactWorkItem>,
    private data: DataSource,
  ) {}

  async reconcileCurrent(
    manager: EntityManager,
    action: GuidedSelfCheckNextAction,
  ) {
    const repo = manager.getRepository(GuidedSelfCheckContactWorkItem);
    const established = await repo.findOne({
      where: { nextActionId: action.id },
      lock: { mode: "pessimistic_read" },
    });
    if (established) return established;
    const current = await repo.findOne({
      where: {
        guidedSelfCheckId: action.guidedSelfCheckId,
        status: In(ACTIVE),
      },
      lock: { mode: "pessimistic_write" },
    });
    if (
      action.type !== GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT
    ) {
      if (current) {
        current.status = GuidedSelfCheckContactWorkItemStatus.CANCELLED;
        await repo.save(current);
        await this.audit(
          manager,
          current,
          "PROFESSIONAL_CONTACT_CANCELLED",
          null,
          { reason: "NEXT_ACTION_REPLACED" },
        );
      }
      return null;
    }
    if (current?.nextActionId === action.id) return current;
    if (current) {
      current.status = GuidedSelfCheckContactWorkItemStatus.CANCELLED;
      await repo.save(current);
      await this.audit(
        manager,
        current,
        "PROFESSIONAL_CONTACT_CANCELLED",
        null,
        { reason: "NEXT_ACTION_REPLACED" },
      );
    }
    const classification = await manager
      .getRepository(GuidedSelfCheckClassificationResult)
      .findOne({ where: { id: action.classificationId } });
    const priority =
      classification?.classification === GuidedSelfCheckClassification.RED
        ? GuidedSelfCheckReviewPriority.URGENT
        : GuidedSelfCheckReviewPriority.ROUTINE;
    const item = await repo.save(
      repo.create({
        guidedSelfCheckId: action.guidedSelfCheckId,
        nextActionId: action.id,
        professionalReviewId: action.professionalReviewId,
        status: GuidedSelfCheckContactWorkItemStatus.PENDING,
        priority,
        acknowledgedByUserId: null,
        acknowledgedAt: null,
        startedByUserId: null,
        startedAt: null,
        completedByUserId: null,
        completedAt: null,
        outcome: null,
        operationalNote: null,
      }),
    );
    await this.audit(manager, item, "PROFESSIONAL_CONTACT_CREATED", null, {
      priority,
      source: action.source,
    });
    return item;
  }

async list(q: GuidedSelfCheckContactWorkItemListQueryDto) {
  const b = this.items
    .createQueryBuilder("item")
    .innerJoinAndSelect("item.selfCheck", "selfCheck");

  if (q.status) {
    b.andWhere("item.status = :status", {
      status: q.status,
    });
  } else {
    b.andWhere("item.status IN (:...statuses)", {
      statuses: ACTIVE,
    });
  }

  if (q.priority) {
    b.andWhere("item.priority = :priority", {
      priority: q.priority,
    });
  }

  // TypeORM cannot reliably parse a raw CASE expression passed
  // directly to orderBy() when pagination + joins are involved.
  b.addSelect(
    `CASE WHEN item.priority = 'URGENT' THEN 0 ELSE 1 END`,
    "priorityOrder",
  );

  b.orderBy("priorityOrder", "ASC")
    .addOrderBy("item.createdAt", "ASC")
    .addOrderBy("item.id", "ASC")
    .skip((q.page - 1) * q.limit)
    .take(q.limit);

  const [rows, total] = await b.getManyAndCount();

  return {
    items: rows.map((x) => this.queueView(x)),
    total,
    page: q.page,
    limit: q.limit,
  };
}
  async get(reference: string) {
    const item = await this.items.findOne({
      where: { reference },
      relations: { selfCheck: { patient: true }, nextAction: true },
    });
    if (!item)
      throw new NotFoundException(
        "Professional contact work item was not found",
      );
    return {
      ...this.queueView(item),
      patient: {
        reference: item.selfCheck.patient.patientReference,
        displayName:
          `${item.selfCheck.patient.givenName} ${item.selfCheck.patient.familyName}`.trim(),
        phone: item.selfCheck.patient.phone,
        email: item.selfCheck.patient.email,
      },
      outcome: item.outcome,
      operationalNote: item.operationalNote,
      completedAt: item.completedAt,
    };
  }
  acknowledge(reference: string, actor: string) {
    return this.transition(
      reference,
      actor,
      GuidedSelfCheckContactWorkItemStatus.PENDING,
      GuidedSelfCheckContactWorkItemStatus.ACKNOWLEDGED,
      "PROFESSIONAL_CONTACT_ACKNOWLEDGED",
    );
  }
  start(reference: string, actor: string) {
    return this.transition(
      reference,
      actor,
      GuidedSelfCheckContactWorkItemStatus.ACKNOWLEDGED,
      GuidedSelfCheckContactWorkItemStatus.IN_PROGRESS,
      "PROFESSIONAL_CONTACT_STARTED",
    );
  }
  async complete(
    reference: string,
    actor: string,
    outcome: GuidedSelfCheckContactWorkItemOutcome,
    note?: string,
  ) {
    return this.data.transaction(async (m) => {
      const item = await this.lock(m, reference);
      if (item.status === GuidedSelfCheckContactWorkItemStatus.COMPLETED)
        return this.queueView(item);
      if (item.status !== GuidedSelfCheckContactWorkItemStatus.IN_PROGRESS)
        throw new ConflictException(
          "Only an in-progress contact work item can be completed",
        );
      item.status = GuidedSelfCheckContactWorkItemStatus.COMPLETED;
      item.outcome = outcome;
      item.operationalNote = note?.trim() || null;
      item.completedByUserId = actor;
      item.completedAt = new Date();
      await m.save(item);
      await this.audit(m, item, "PROFESSIONAL_CONTACT_COMPLETED", actor, {
        outcome,
        hasOperationalNote: !!item.operationalNote,
      });
      return this.queueView(item);
    });
  }
  async cancel(reference: string, actor: string, reason?: string) {
    return this.data.transaction(async (m) => {
      const item = await this.lock(m, reference);
      if (item.status === GuidedSelfCheckContactWorkItemStatus.CANCELLED)
        return this.queueView(item);
      if (item.status === GuidedSelfCheckContactWorkItemStatus.COMPLETED)
        throw new ConflictException(
          "Completed contact work cannot be cancelled",
        );
      item.status = GuidedSelfCheckContactWorkItemStatus.CANCELLED;
      item.operationalNote = reason?.trim() || null;
      await m.save(item);
      await this.audit(m, item, "PROFESSIONAL_CONTACT_CANCELLED", actor, {
        hasReason: !!item.operationalNote,
      });
      return this.queueView(item);
    });
  }
  async patientState(guidedSelfCheckId: string) {
    const item = await this.items
      .createQueryBuilder("item")
      .innerJoin("item.nextAction", "action", "action.isCurrent = true")
      .where("item.guidedSelfCheckId = :id", { id: guidedSelfCheckId })
      .orderBy("item.createdAt", "DESC")
      .getOne();
    return item
      ? {
          required: true,
          status: item.status,
          completedAt: item.completedAt,
          outcome:
            item.status === GuidedSelfCheckContactWorkItemStatus.COMPLETED
              ? item.outcome
              : null,
        }
      : null;
  }
  private transition(
    reference: string,
    actor: string,
    from: GuidedSelfCheckContactWorkItemStatus,
    to: GuidedSelfCheckContactWorkItemStatus,
    event: string,
  ) {
    return this.data.transaction(async (m) => {
      const item = await this.lock(m, reference);
      if (item.status === to) return this.queueView(item);
      if (item.status !== from)
        throw new ConflictException(
          "Professional contact work item cannot transition in its current state",
        );
      item.status = to;
      if (to === GuidedSelfCheckContactWorkItemStatus.ACKNOWLEDGED) {
        item.acknowledgedByUserId = actor;
        item.acknowledgedAt = new Date();
      } else {
        item.startedByUserId = actor;
        item.startedAt = new Date();
      }
      await m.save(item);
      await this.audit(m, item, event, actor, {});
      return this.queueView(item);
    });
  }
  private async lock(m: EntityManager, reference: string) {
    const repo = m.getRepository(GuidedSelfCheckContactWorkItem);
    const locked = await repo.findOne({
      where: { reference },
      lock: { mode: "pessimistic_write" },
    });
    if (!locked)
      throw new NotFoundException(
        "Professional contact work item was not found",
      );
    const item = await repo.findOne({
      where: { id: locked.id },
      relations: { selfCheck: true },
    });
    if (!item)
      throw new NotFoundException(
        "Professional contact work item was not found",
      );
    return item;
  }
  private audit(
    m: EntityManager,
    item: GuidedSelfCheckContactWorkItem,
    event: string,
    actor: string | null,
    metadata: Record<string, unknown>,
  ) {
    return m
      .getRepository(GuidedSelfCheckHistory)
      .save({
        guidedSelfCheckId: item.guidedSelfCheckId,
        event,
        actorUserId: actor,
        metadata: { contactReference: item.reference, ...metadata },
      });
  }
  private queueView(item: GuidedSelfCheckContactWorkItem) {
    return {
      reference: item.reference,
      selfCheckReference: item.selfCheck?.reference,
      priority: item.priority,
      status: item.status,
      createdAt: item.createdAt,
      acknowledgedAt: item.acknowledgedAt,
      startedAt: item.startedAt,
    };
  }
}
