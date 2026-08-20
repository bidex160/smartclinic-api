import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { BookingFunding } from "../bookings/entities/booking-funding.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingFundingSourceType } from "../bookings/enums/booking-funding-source-type.enum";
import { BookingFundingStatus } from "../bookings/enums/booking-funding-status.enum";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { AdminMatchingQueueQueryDto } from "./dto/admin-matching-queue-query.dto";
import {
  AdminMatchingQueueItemDto,
  AdminMatchingQueueResponseDto,
} from "./dto/admin-matching-queue-response.dto";
import { ProviderAssignment } from "./entities/provider-assignment.entity";
import { deriveMatchingReadiness } from "./matching-readiness";

@Injectable()
export class AdminMatchingQueueService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(BookingFunding)
    private readonly funding: Repository<BookingFunding>,
    @InjectRepository(ProviderAssignment)
    private readonly assignments: Repository<ProviderAssignment>,
  ) {}

 async list(
  query: AdminMatchingQueueQueryDto,
): Promise<AdminMatchingQueueResponseDto> {
  const builder = this.bookings
    .createQueryBuilder("booking")
    .leftJoinAndSelect("booking.healthCheckPackage", "package")
    .leftJoinAndSelect("booking.fulfilmentMode", "fulfilmentMode")
    .leftJoinAndSelect("booking.participant", "participant")
    .where("booking.status = :bookingStatus", {
      bookingStatus:
        query.bookingStatus ?? BookingStatus.PENDING_PROVIDER_MATCH,
    });

  if (!query.bookingStatus) {
    builder.andWhere(
      `
        EXISTS (
          SELECT 1
          FROM booking_funding ready_funding
          WHERE ready_funding.booking_id = booking.id
            AND ready_funding.source_type = :selfSource
            AND ready_funding.status = :settledFunding
        )
      `,
      {
        selfSource: BookingFundingSourceType.SELF,
        settledFunding: BookingFundingStatus.SETTLED,
      },
    );
  }

  if (query.packageId) {
    builder.andWhere(
      "booking.healthCheckPackageId = :packageId",
      {
        packageId: query.packageId,
      },
    );
  }

  if (query.fulfilmentModeId) {
    builder.andWhere(
      "booking.fulfilmentModeId = :fulfilmentModeId",
      {
        fulfilmentModeId: query.fulfilmentModeId,
      },
    );
  }

  if (query.preferredDate) {
    builder.andWhere(
      "booking.preferredDate = :preferredDate",
      {
        preferredDate: query.preferredDate,
      },
    );
  }

  if (query.bookingReference) {
    builder.andWhere(
      "booking.bookingReference = :bookingReference",
      {
        bookingReference: query.bookingReference,
      },
    );
  }

  if (query.providerAssignmentStatus) {
    builder.andWhere(
      `(
        SELECT latest_assignment.status
        FROM provider_assignments latest_assignment
        WHERE latest_assignment.booking_id = booking.id
        ORDER BY latest_assignment.created_at DESC,
                 latest_assignment.id DESC
        LIMIT 1
      ) = :assignmentStatus`,
      {
        assignmentStatus: query.providerAssignmentStatus,
      },
    );
  }

  builder
    .orderBy("booking.createdAt", "ASC")
    .addOrderBy("booking.bookingReference", "ASC")
    .skip((query.page - 1) * query.limit)
    .take(query.limit);

  const [bookings, total] = await builder.getManyAndCount();

  const ids = bookings.map((booking) => booking.id);

  const fundingRows = ids.length
    ? await this.funding.find({
        where: {
          bookingId: In(ids),
          sourceType: BookingFundingSourceType.SELF,
        },
      })
    : [];

  const assignmentRows = ids.length
    ? await this.assignments.find({
        where: {
          bookingId: In(ids),
        },
        relations: {
          provider: true,
        },
        order: {
          createdAt: "DESC",
          id: "DESC",
        },
      })
    : [];

  const fundingByBooking = new Map(
    fundingRows.map((funding) => [
      funding.bookingId,
      funding,
    ]),
  );

  const assignmentByBooking =
    new Map<string, ProviderAssignment>();

  for (const assignment of assignmentRows) {
    if (!assignmentByBooking.has(assignment.bookingId)) {
      assignmentByBooking.set(
        assignment.bookingId,
        assignment,
      );
    }
  }

  return {
    items: bookings.map((booking) =>
      this.map(
        booking,
        fundingByBooking.get(booking.id) ?? null,
        assignmentByBooking.get(booking.id) ?? null,
      ),
    ),

    page: query.page,
    limit: query.limit,
    total,
    totalPages:
      total === 0
        ? 0
        : Math.ceil(total / query.limit),
  };
}

  private map(
    booking: Booking,
    funding: BookingFunding | null,
    assignment: ProviderAssignment | null,
  ): AdminMatchingQueueItemDto {
    return {
      bookingReference: booking.bookingReference,
      bookingStatus: booking.status,
      package: {
        code: booking.healthCheckPackage.code,
        name: booking.healthCheckPackage.name,
      },
      fulfilmentMode: {
        code: booking.fulfilmentMode.code,
        name: booking.fulfilmentMode.name,
      },
      participant: {
        givenName: booking.participant.givenName,
        familyName: booking.participant.familyName,
      },
      preferredDate: booking.preferredDate,
      preferredTimeFrom: booking.preferredTimeWindowStart,
      preferredTimeTo: booking.preferredTimeWindowEnd,
      preferredTimezone: booking.preferredTimezone,
      fundingStatus: funding?.status ?? null,
      quotedAmount: booking.quotedAmount,
      quotedCurrency: booking.currency,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      currentAssignmentStatus: assignment?.status ?? null,
      currentProviderName: assignment?.provider.displayName ?? null,
      readiness: deriveMatchingReadiness(booking, funding, assignment),
    };
  }
}
