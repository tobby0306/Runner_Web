-- ==============================================================================
-- Runner Pulse Analytics - Database Schema (DDL)
-- 依據 SA 系統規格書 Section 4 實作實體關聯模型 (PostgreSQL / SQLite 相容)
-- ==============================================================================

-- 1. 訓練活動主表 (ACTIVITY)
CREATE TABLE IF NOT EXISTS activities (
    activity_id VARCHAR(64) PRIMARY KEY,
    activity_date TIMESTAMP WITH TIME ZONE NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    workout_type VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
    duration_total_sec INTEGER NOT NULL DEFAULT 0,
    duration_moving_sec INTEGER NOT NULL DEFAULT 0,
    rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
    training_load NUMERIC(6, 2) DEFAULT 0,
    distance_km NUMERIC(6, 3) NOT NULL,
    pace_avg_sec_per_km NUMERIC(6, 2) NOT NULL,
    hr_avg NUMERIC(5, 1),
    hr_max NUMERIC(5, 1),
    cadence_avg NUMERIC(5, 1),
    stride_length_m NUMERIC(4, 2),
    elevation_gain_m INTEGER DEFAULT 0,
    lap_splits_raw TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(workout_type);

-- 2. 每公里分段紀錄表 (LAP_SPLIT)
CREATE TABLE IF NOT EXISTS lap_splits (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(64) NOT NULL REFERENCES activities(activity_id) ON DELETE CASCADE,
    lap_number INTEGER NOT NULL,
    pace_sec_per_km NUMERIC(6, 2) NOT NULL,
    hr_avg NUMERIC(5, 1),
    segment_label VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_activity_lap UNIQUE (activity_id, lap_number)
);

CREATE INDEX IF NOT EXISTS idx_lap_splits_activity ON lap_splits(activity_id);

-- 3. VDOT 跑力歷史紀錄表 (VDOT_RECORD)
CREATE TABLE IF NOT EXISTS vdot_records (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(64) UNIQUE REFERENCES activities(activity_id) ON DELETE SET NULL,
    calc_date TIMESTAMP WITH TIME ZONE NOT NULL,
    distance_km NUMERIC(6, 3) NOT NULL,
    finish_time_sec INTEGER NOT NULL,
    vdot_score NUMERIC(4, 1) NOT NULL,
    race_type VARCHAR(32) NOT NULL, -- '5K_TEST', 'HALF_MARATHON', 'FULL_MARATHON'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vdot_date ON vdot_records(calc_date DESC);

-- 4. 跑者訓練配速與心率區間表 (TRAINING_ZONE)
CREATE TABLE IF NOT EXISTS training_zones (
    id SERIAL PRIMARY KEY,
    vdot_score NUMERIC(4, 1) NOT NULL,
    zone_name VARCHAR(32) NOT NULL, -- 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5a', 'Zone 5b'
    zone_label VARCHAR(64) NOT NULL,
    pace_sec_min NUMERIC(6, 2) NOT NULL,
    pace_sec_max NUMERIC(6, 2) NOT NULL,
    hr_min INTEGER NOT NULL,
    hr_max INTEGER NOT NULL,
    pct_lthr_label VARCHAR(32),
    core_purpose TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 課表目標與執行追蹤表 (SCHEDULE)
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    week_id VARCHAR(16) NOT NULL, -- 'W1' ~ 'W7'
    planned_date DATE NOT NULL,
    workout_name VARCHAR(255) NOT NULL,
    tag VARCHAR(8) NOT NULL, -- 'E', 'Q', 'L', 'R'
    target_distance_km NUMERIC(6, 2) NOT NULL,
    target_duration_sec INTEGER,
    intensity_note TEXT,
    actual_activity_id VARCHAR(64) REFERENCES activities(activity_id) ON DELETE SET NULL,
    actual_distance_km NUMERIC(6, 2),
    status VARCHAR(32) DEFAULT 'PLANNED', -- 'PLANNED', 'COMPLETED', 'SKIPPED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(planned_date);
