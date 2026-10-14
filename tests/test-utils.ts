import type { SessionUser } from "@/lib/auth";

let idCounter = 0;

function generateMockId(): string {
  // Generate a 24-character hex string that looks like a MongoDB ObjectId
  const id = ++idCounter;
  const hex = id.toString(16).padStart(24, "0");
  return hex.slice(0, 24);
}

export function createMockSessionUser(
  overrides?: Partial<SessionUser>,
): SessionUser {
  return {
    id: generateMockId(),
    username: "testuser",
    name: "Test User",
    role: "HOST",
    branch: null,
    status: "ACTIVE",
    ...overrides,
  };
}

export function createMockAgentSessionUser(branchId: string): SessionUser {
  return {
    id: generateMockId(),
    username: "agent1",
    name: "Agent One",
    role: "AGENT",
    branch: branchId,
    status: "ACTIVE",
  };
}

export function createMockBranchId(): string {
  return generateMockId();
}

export function createMockCustomerId(): string {
  return generateMockId();
}

export function createMockServiceId(): string {
  return generateMockId();
}

export function createMockTransactionId(): string {
  return generateMockId();
}

export function createMockPaymentId(): string {
  return generateMockId();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
