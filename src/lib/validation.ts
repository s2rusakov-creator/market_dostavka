import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "./constants";

export const createListingSchema = z
  .object({
    category: z.enum([
      "DOCUMENTS",
      "MEDICINE",
      "ELECTRONICS",
      "CLOTHES",
      "OTHER",
    ]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    weightKg: z.coerce.number().min(0).max(50).optional(),
    sizePreset: z.enum(["POCKET", "BAG", "LUGGAGE"]).optional(),
    dimensions: z.string().trim().max(60).optional().or(z.literal("")),
    deadlineFrom: z.coerce.date().optional(),
    deadlineTo: z.coerce.date(),
    pickupArea: z.string().trim().max(80).optional().or(z.literal("")),
    priceRub: z.coerce.number().int().min(1).max(1_000_000),
    photoUrl: z.string().trim().max(500).optional().or(z.literal("")),
    urgent: z.boolean().optional(),
    fragile: z.boolean().optional(),
    needsLuggage: z.boolean().optional(),
    acceptTerms: z.literal(true),
  })
  .refine((v) => !v.deadlineFrom || v.deadlineFrom <= v.deadlineTo, {
    message: "deadlineFrom must be <= deadlineTo",
    path: ["deadlineFrom"],
  });

export const messageSchema = z.object({
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const respondSchema = z.object({
  text: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
});

export const reportSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const localeSchema = z.object({ locale: z.enum(["ru", "az"]) });
export const soundSchema = z.object({ soundEnabled: z.boolean() });
