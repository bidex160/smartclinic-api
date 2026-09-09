import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appConfig } from "../../config/app.config";
import { PaymentAttemptStatus } from "../enums/payment-attempt-status.enum";
import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentProviderAdapter,
  PaymentProviderWebhookEvent,
  VerifyPaymentResult,
} from "../payment-provider.adapter";
import {
  decimalToSubunit,
  subunitToDecimal,
} from "./paystack-payment-provider.adapter";

type OpayStatus = "INITIAL" | "PENDING" | "SUCCESS" | "FAIL" | "CLOSE";

interface OpayEnvelope<T> {
  code?: string;
  message?: string;
  data?: T;
}

interface OpayPaymentData {
  reference?: string;
  orderNo?: string;
  cashierUrl?: string;
  status?: OpayStatus;
  amount?: { total?: number | string; currency?: string };
}

interface OpayCallbackPayload {
  payload?: {
    reference?: unknown;
    amount?: unknown;
    currency?: unknown;
    refunded?: unknown;
    status?: unknown;
    timestamp?: unknown;
    token?: unknown;
    transactionId?: unknown;
  };
  sha512?: unknown;
  type?: unknown;
}

@Injectable()
export class OpayPaymentProviderAdapter implements PaymentProviderAdapter {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async initializePayment(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const opay = this.config.payments.opay;
    const merchantId = this.required(opay.merchantId);
    const publicKey = this.required(opay.publicKey);
    const returnBaseUrl = this.config.frontendUrl;


    if (!returnBaseUrl) {
      throw new ServiceUnavailableException(
        "OPay return URL is not configured",
      );
    }

    const returnUrl = input.callbackUrl
      ? `${input.callbackUrl}`
      : `${returnBaseUrl.replace(/\/$/, "")}/me/payment-return/${encodeURIComponent(input.paymentReference)}`;

    if (!returnUrl)
      throw new ServiceUnavailableException(
        "OPay return URL is not configured",
      );
    if (input.currency.toUpperCase() !== "NGN")
      throw new BadGatewayException(
        "OPay supports only NGN payments for this merchant",
      );

    const body: Record<string, unknown> = {
      amount: {
        currency: input.currency.toUpperCase(),
        total: Number(decimalToSubunit(input.amount)),
      },
      country: "NG",
      reference: input.paymentReference,
      returnUrl,
      product: {
        name: "SmartClinic exchange payment",
        description: "SmartClinic exchange patient payment",
      },
    };
    if (opay.callbackUrl) body.callbackUrl = opay.callbackUrl;
    const envelope = await this.request<OpayPaymentData>(
      "/api/v1/international/cashier/create",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${publicKey}`,
          MerchantId: merchantId,
        },
      },
    );
    const data = envelope.data;
    if (envelope.code !== "00000" || !data?.reference || !data.cashierUrl)
      throw new BadGatewayException("Payment provider rejected initialization");
    return {
      providerCode: "OPAY",
      providerReference: data.reference,
      status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION,
      checkoutUrl: data.cashierUrl,
      accessCode: data.orderNo ?? null,
    };
  }

  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> {
    const opay = this.config.payments.opay;
    const merchantId = this.required(opay.merchantId);
    const privateKey = this.required(opay.privateKey);
    const body = JSON.stringify({
      country: "NG",
      reference: providerReference,
    });
    const envelope = await this.request<OpayPaymentData>(
      "/api/v1/international/cashier/status",
      {
        method: "POST",
        body,
        headers: {
          Authorization: `Bearer ${createHmac("sha512", privateKey).update(body).digest("hex")}`,
          MerchantId: merchantId,
        },
      },
    );
    const data = envelope.data;
    if (
      envelope.code !== "00000" ||
      !data?.reference ||
      data.reference !== providerReference ||
      data.amount?.total === undefined ||
      !data.amount.currency
    )
      throw new BadGatewayException(
        "Payment provider verification response was invalid",
      );
    const status = mapOpayStatus(data.status);
    return {
      succeeded: status === PaymentAttemptStatus.SUCCEEDED,
      status,
      providerReference: data.reference,
      amount: subunitToDecimal(data.amount.total),
      currency: data.amount.currency.toUpperCase(),
      occurredAt: new Date(),
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.payments.opay.privateKey;
    if (!secret || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    let parsed: OpayCallbackPayload;
    try {
      parsed = JSON.parse(rawBody.toString("utf8")) as OpayCallbackPayload;
    } catch {
      return false;
    }
    const payload = parsed.payload;
    if (!payload) return false;
    const canonical = `{Amount:"${String(payload.amount ?? "")}",Currency:"${String(payload.currency ?? "")}",Reference:"${String(payload.reference ?? "")}",Refunded:${payload.refunded ? "t" : "f"},Status:"${String(payload.status ?? "")}",Timestamp:"${String(payload.timestamp ?? "")}",Token:"${String(payload.token ?? "")}",TransactionID:"${String(payload.transactionId ?? "")}"}`;
    const expected = createHmac("sha3-512", secret)
      .update(canonical)
      .digest("hex");
    const supplied = signature.toLowerCase();
    if (!/^[a-f0-9]{128}$/.test(supplied)) return false;
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(supplied, "hex"),
    );
  }

  parseWebhook(rawBody: Buffer): PaymentProviderWebhookEvent {
    try {
      const parsed = JSON.parse(
        rawBody.toString("utf8"),
      ) as OpayCallbackPayload;
      const payload = parsed.payload;
      return {
        type:
          typeof parsed.type === "string"
            ? parsed.type
            : typeof payload?.status === "string"
              ? payload.status
              : "unsupported",
        reference:
          typeof payload?.reference === "string" ? payload.reference : null,
      };
    } catch {
      throw new BadGatewayException("Malformed payment webhook");
    }
  }

  private required(value?: string): string {
    if (!value)
      throw new ServiceUnavailableException(
        "Payment provider is not configured",
      );
    return value;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { headers: Record<string, string> },
  ): Promise<OpayEnvelope<T>> {
    try {
      const response = await fetch(
        `${this.config.payments.opay.baseUrl}${path}`,
        {
          ...init,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...init.headers,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok)
        throw new BadGatewayException("Payment provider request failed");
      const body = (await response.json()) as OpayEnvelope<T>;
      if (!body || typeof body.code !== "string")
        throw new BadGatewayException(
          "Payment provider returned a malformed response",
        );
      return body;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException(
        "Payment provider is temporarily unavailable",
      );
    }
  }
}

export function mapOpayStatus(
  status?: OpayStatus,
):
  | PaymentAttemptStatus.PENDING_CONFIRMATION
  | PaymentAttemptStatus.SUCCEEDED
  | PaymentAttemptStatus.FAILED
  | PaymentAttemptStatus.CANCELLED {
  if (status === "SUCCESS") return PaymentAttemptStatus.SUCCEEDED;
  if (status === "FAIL") return PaymentAttemptStatus.FAILED;
  if (status === "CLOSE") return PaymentAttemptStatus.CANCELLED;
  return PaymentAttemptStatus.PENDING_CONFIRMATION;
}
