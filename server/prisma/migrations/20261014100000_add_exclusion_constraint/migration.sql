-- Phần 4: Chống trùng ở tầng database
-- Exclusion constraint trên booking_zones — chốt chặn cuối chống race condition

-- Extension btree_gist cho phép dùng operator = với GiST index trên kiểu text
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exclusion constraint: không cho 2 booking_zone active nào dùng chung zone_id
-- VÀ có khoảng thời gian chồng nhau.
-- Prisma không tạo được constraint này, nên phải viết SQL thuần.
ALTER TABLE booking_zones
ADD CONSTRAINT no_overlap
EXCLUDE USING gist (
  zone_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (is_active);
