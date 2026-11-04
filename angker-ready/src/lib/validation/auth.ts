import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "USERNAME_INVALID"),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(8, "PASSWORD_TOO_SHORT")
    .max(128)
    .regex(/[a-z]/, "PASSWORD_NEED_LOWER")
    .regex(/[A-Z]/, "PASSWORD_NEED_UPPER")
    .regex(/[0-9]/, "PASSWORD_NEED_DIGIT"),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true),
}).refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "PASSWORD_MISMATCH" });

export const loginSchema = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
  remember: z.boolean().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"] });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});
