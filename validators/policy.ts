import { z } from "zod";

const policySectionSchema = z
  .object({
    heading: z.string().trim().min(1, "Give the section a heading").max(120),
    body: z.array(z.string().trim().min(1)).min(1, "Add at least one paragraph"),
  })
  .strict();

export const updatePolicySchema = z
  .object({
    title: z.string().trim().min(1, "Give the policy a title").max(160).optional(),
    intro: z.string().trim().min(1, "Give the policy an introduction").max(600).optional(),
    sections: z.array(policySectionSchema).min(1, "Add at least one section").optional(),
  })
  .strict();

export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
