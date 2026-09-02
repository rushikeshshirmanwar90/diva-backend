export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/** Builds pagination meta from the values a repository already computed. */
export function paginationMeta(input: { page: number; limit: number; total: number }): PaginationMeta {
  const totalPages = input.limit > 0 ? Math.ceil(input.total / input.limit) : 0;

  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages,
    hasNext: input.page < totalPages,
    hasPrev: input.page > 1,
  };
}
