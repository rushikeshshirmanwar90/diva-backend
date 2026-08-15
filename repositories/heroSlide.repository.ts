import { HeroSlideModel, type HeroSlideDocument } from "@/models/HeroSlide";
import { notDeleted } from "@/models/base";

export async function findById(id: string) {
  return HeroSlideModel.findOne({ _id: id, ...notDeleted }).lean();
}

/** Public storefront read: active slides only, in display order. */
export async function listActive() {
  return HeroSlideModel.find({ isActive: true, ...notDeleted })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();
}

/** Admin read: everything, so an inactive slide is still there to re-enable. */
export async function listAll() {
  return HeroSlideModel.find({ ...notDeleted }).sort({ displayOrder: 1, createdAt: 1 }).lean();
}

export async function create(input: Partial<HeroSlideDocument>) {
  const slide = await HeroSlideModel.create(input);
  return slide.toObject();
}

export async function updateById(id: string, update: Partial<HeroSlideDocument>) {
  return HeroSlideModel.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: update }, {
    returnDocument: 'after',
  }).lean();
}

export async function softDelete(id: string) {
  return HeroSlideModel.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: 'after' },
  ).lean();
}
