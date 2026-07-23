import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "erpv2_session";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? "28800"); // 8 hours

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET_REQUIRED_IN_PRODUCTION");
  }
  return "erp_v2_local_development_only";
}

export type SessionPayload = {
  userId: string;
  username: string;
  activeMembershipId: string | null;
};

export type LoginInput = {
  username: string;
  password: string;
  membershipId?: string;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export async function issueSessionToken(payload: SessionPayload) {
  return new Promise<string>((resolve, reject) => {
    jwt.sign(
      { ...payload },
      getSessionSecret(),
      { algorithm: "HS256", expiresIn: SESSION_TTL_SECONDS },
      (error, token) => {
        if (error || !token) {
          reject(error ?? new Error("签发令牌失败"));
          return;
        }
        resolve(token);
      },
    );
  });
}

export async function parseSessionFromToken(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;

  return new Promise((resolve) => {
    jwt.verify(token, getSessionSecret(), (error, decoded) => {
      if (error || !decoded) {
        resolve(null);
        return;
      }
      const data = decoded as JwtPayload & SessionPayload;
      if (!data.userId || !data.username) {
        resolve(null);
        return;
      }
      resolve({
        userId: data.userId,
        username: data.username,
        activeMembershipId: data.activeMembershipId ?? null,
      });
    });
  });
}

export function parseSessionCookie(raw?: string) {
  if (!raw) return null;
  return parseSessionFromToken(raw);
}

export async function getActiveMembershipById(membershipId: string | null) {
  if (!membershipId) return null;
  const now = new Date();
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: {
      role: true,
      user: true,
      businessUnit: true,
      department: true,
    },
  });
}

export async function resolvePrimaryMembership(userId: string) {
  const now = new Date();
  return prisma.membership.findFirst({
    where: {
      userId,
      isActive: true,
      isPrimary: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: {
      role: true,
      businessUnit: true,
      department: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getMembershipById(id: string | null) {
  if (!id) return null;
  const now = new Date();
  return prisma.membership.findFirst({
    where: {
      id,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: {
      role: true,
      businessUnit: true,
      legalEntity: true,
      department: true,
      site: true,
      user: true,
    },
  });
}
