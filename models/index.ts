/**
 * Model registry.
 *
 * Imported once by `connectToDatabase()` so that every schema is registered
 * before any query runs. This matters for two reasons that only bite at
 * runtime:
 *
 *  - `populate('categoryIds')` throws `MissingSchemaError` if the Category
 *    model has not been registered yet. Whether it has depends on which route
 *    the request happened to hit first, which makes the failure look random.
 *  - Index creation is triggered on registration. A model nothing has imported
 *    yet has no indexes, so the first query against it does a collection scan.
 *
 * Importing them all in one place removes the ordering question entirely.
 */

export { UserModel, type UserDocument } from "@/models/User";
export { RefreshTokenModel, type RefreshTokenDocument } from "@/models/RefreshToken";
export { RateLimitModel, type RateLimitDocument } from "@/models/RateLimit";

export { CategoryModel, type CategoryDocument } from "@/models/Category";
export { CollectionModel, type CollectionDocument } from "@/models/Collection";
export { ProductModel, type ProductDocument, type Variant } from "@/models/Product";

export { CartModel, type CartDocument, type CartItem } from "@/models/Cart";
export { AddressModel, type AddressDocument } from "@/models/Address";
export { OrderModel, type OrderDocument } from "@/models/Order";
export { PaymentModel, type PaymentDocument } from "@/models/Payment";
export { ShipmentModel, type ShipmentDocument } from "@/models/Shipment";
export {
  CouponModel,
  CouponRedemptionModel,
  type CouponDocument,
  type CouponRedemptionDocument,
} from "@/models/Coupon";

export { ReviewModel, type ReviewDocument } from "@/models/Review";
export { WishlistModel, type WishlistDocument } from "@/models/Wishlist";
export { NotificationModel, type NotificationDocument } from "@/models/Notification";
export { BlogModel, type BlogDocument } from "@/models/Blog";
export { SettingModel, type SettingDocument } from "@/models/Setting";
export { ContactMessageModel, type ContactMessageDocument } from "@/models/ContactMessage";
export { AuditLogModel, type AuditLogDocument } from "@/models/AuditLog";

export * from "@/models/enums";
