-- Migration 075: intentional no-op.
-- The columns collected_at and collected_amount were already added in
-- 074_transfer_collect_and_driver_cut.sql. This file exists only to keep
-- migration numbering contiguous. Do NOT add DDL here.
SELECT 1;
