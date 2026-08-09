import { z } from "zod";
import { pagination } from "@/validators/common";
import { ROLES } from "@/models/enums";

export const listCustomersSchema = z
  .object({
    ...pagination.shape,
    role: z.enum(ROLES).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

export const setCustomerActiveSchema = z.object({ isActive: z.boolean() }).strict();
