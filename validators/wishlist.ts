import { z } from "zod";
import { objectId } from "@/validators/common";

export const addWishlistItemSchema = z.object({ productId: objectId }).strict();
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;

export const productIdParam = z.object({ productId: objectId });
