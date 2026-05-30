interface PaginationParams {
  pageNum: number;
  limitNum: number;
  skip: number;
}

export function getPaginationParams(page?: string, limit?: string): PaginationParams {
  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit || '10', 10)));
  const skip = (pageNum - 1) * limitNum;

  return { pageNum, limitNum, skip };
}
