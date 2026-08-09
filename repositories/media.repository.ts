import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { CollectionModel } from "@/models/Collection";
import { notDeleted } from "@/models/base";

/**
 * The media library, assembled from what the catalogue already references.
 *
 * There is no `Media` collection. Images live embedded on the documents that
 * use them, which is the right shape for reading a product page and the wrong
 * shape for answering "what images do we have?" — so this reassembles that view
 * on demand.
 *
 * **Why not ask Cloudinary?** Listing an account's assets is the Admin API, and
 * that needs `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`, which this
 * deployment does not have (uploads are unsigned — see
 * `app/admin/_components/image-upload.tsx`). Fill those in and a "browse
 * everything in the cloud" source becomes possible; until then this shows every
 * image Diva itself has ever attached, which is the set an admin actually wants
 * to reuse.
 */

export type MediaAsset = {
  publicId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  /** Where it is currently used, for context in the picker. */
  usedIn: string;
  usedInType: "product" | "category" | "collection";
};

/**
 * Every distinct image the catalogue references, newest-updated first.
 *
 * Deduplicated on `publicId`: one photo reused across three products should
 * appear once, and the first occurrence wins so the `usedIn` label names a real
 * place rather than an arbitrary one.
 *
 * `limit` is applied per source rather than to the union. A store with two
 * thousand product photos would otherwise never surface a category image, and
 * the picker exists precisely to find those.
 */
export async function listCatalogueImages(options: {
  limit: number;
  search?: string;
}): Promise<MediaAsset[]> {
  const { limit, search } = options;

  // Anchored and escaped: an unescaped user string in a regex is both a
  // backtracking DoS and a way to match everything with `.*`.
  const term = search
    ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;

  const [products, categories, collections] = await Promise.all([
    ProductModel.find({ ...notDeleted, ...(term ? { title: term } : {}) })
      .select("title images")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),

    CategoryModel.find({
      ...notDeleted,
      image: { $ne: null },
      ...(term ? { name: term } : {}),
    })
      .select("name image")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),

    CollectionModel.find({ ...notDeleted, ...(term ? { name: term } : {}) })
      .select("name bannerImage mobileBannerImage")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const seen = new Set<string>();
  const assets: MediaAsset[] = [];

  const add = (
    image: { publicId?: string; url?: string; alt?: string; width?: number; height?: number } | null | undefined,
    usedIn: string,
    usedInType: MediaAsset["usedInType"],
  ) => {
    if (!image?.publicId || !image.url) return;
    if (seen.has(image.publicId)) return;

    seen.add(image.publicId);
    assets.push({
      publicId: image.publicId,
      url: image.url,
      alt: image.alt ?? usedIn,
      width: image.width,
      height: image.height,
      usedIn,
      usedInType,
    });
  };

  for (const product of products) {
    for (const image of product.images ?? []) add(image, product.title, "product");
  }

  for (const category of categories) add(category.image, category.name, "category");

  for (const collection of collections) {
    add(collection.bannerImage, collection.name, "collection");
    add(collection.mobileBannerImage, collection.name, "collection");
  }

  return assets;
}
