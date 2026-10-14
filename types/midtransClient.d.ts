// @/types/midtransClient.d.ts
// midtrans-client ships no TypeScript types at all (no "types" field in its
// package.json). This covers only what lib/midtrans.ts actually calls —
// not the full SDK surface (Snap, Iris, card/subscription APIs, etc).
declare module "midtrans-client" {
  export interface MidtransClientOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  export class MidtransError extends Error {
    httpStatusCode: number | null;
    ApiResponse: unknown;
    rawHttpClientData: unknown;
  }

  export class CoreApi {
    constructor(options: MidtransClientOptions);
    charge(
      parameter: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    transaction: {
      status(transactionId: string): Promise<Record<string, unknown>>;
    };
  }
}
