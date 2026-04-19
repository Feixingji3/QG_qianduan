-- 为 scores 表添加 status 字段，用于软删除
-- 执行方式：在 Navicat 中运行此 SQL

-- 添加 status 字段，默认值为 1（正常状态）
ALTER TABLE scores 
ADD COLUMN status TINYINT DEFAULT 1 COMMENT '状态：1正常，0已删除';

-- 为已有数据设置 status = 1
UPDATE scores SET status = 1 WHERE status IS NULL;
