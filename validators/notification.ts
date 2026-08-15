import { z } from "zod";
import { pagination } from "@/validators/common";

export const listNotificationsSchema = z.object({ ...pagination.shape }).strict();
export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
