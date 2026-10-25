-- Minimal existing-domain schema for a disposable finance test database only.
CREATE TABLE labor_agency_owner (uuid uuid PRIMARY KEY);
CREATE TABLE app_account (uuid uuid PRIMARY KEY, labor_agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    login_id text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE worker (uuid uuid PRIMARY KEY, canonical_name text, gender text DEFAULT 'UNKNOWN', age smallint);
CREATE TABLE farm_owner (uuid uuid PRIMARY KEY, canonical_name text, canonical_business_name text,
    status text DEFAULT 'ACTIVE', deleted_at timestamptz);
CREATE TABLE labor_agency_worker_profile (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    worker_uuid uuid REFERENCES worker, local_name text, local_nickname text, local_phone_encrypted text,
    local_pickup_location text, pickup_location text, status text DEFAULT 'ACTIVE', deleted_at timestamptz,
    UNIQUE(agency_owner_uuid, uuid));
CREATE TABLE labor_agency_farm_owner_profile (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    farm_owner_uuid uuid REFERENCES farm_owner, local_name text, local_nickname text, local_business_name text,
    status text DEFAULT 'ACTIVE', deleted_at timestamptz, UNIQUE(agency_owner_uuid, uuid));
CREATE TABLE farm_work_site (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    owner_uuid uuid REFERENCES farm_owner, client_work_site_uuid uuid, site_name text, farm_address text,
    work_description text, daily_start_time time, daily_end_time time, status text DEFAULT 'ACTIVE',
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
    UNIQUE(agency_owner_uuid, uuid));
CREATE TABLE work_schedule_day (uuid uuid PRIMARY KEY, work_site_uuid uuid NOT NULL REFERENCES farm_work_site,
    work_date date NOT NULL, daily_start_time time, daily_end_time time, male_required_count smallint DEFAULT 0,
    female_required_count smallint DEFAULT 0, status text DEFAULT 'ACTIVE',
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE work_schedule_assignment (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    schedule_day_uuid uuid NOT NULL REFERENCES work_schedule_day, work_site_uuid uuid NOT NULL REFERENCES farm_work_site,
    worker_profile_uuid uuid REFERENCES labor_agency_worker_profile, work_date date NOT NULL,
    assignment_area text DEFAULT 'MEN', worker_count smallint DEFAULT 1, participant_group_uuid uuid DEFAULT gen_random_uuid(),
    participant_type text DEFAULT 'REGISTERED', participant_display_name text, participant_pickup_location text,
    settlement_recipient_worker_profile_uuid uuid, planned_start_time time, planned_end_time time,
    status text DEFAULT 'PLANNED', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz, UNIQUE(agency_owner_uuid, uuid));
CREATE TABLE worker_attendance_record (uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_owner_uuid uuid NOT NULL REFERENCES labor_agency_owner,
    assignment_uuid uuid NOT NULL REFERENCES work_schedule_assignment, schedule_day_uuid uuid REFERENCES work_schedule_day,
    worker_profile_uuid uuid REFERENCES labor_agency_worker_profile, work_date date,
    actual_start_at timestamptz, actual_end_at timestamptz, break_minutes integer DEFAULT 60,
    status text DEFAULT 'DRAFT', time_entry_type text DEFAULT 'UNKNOWN', confirmed_at timestamptz,
    confirmed_by_account_uuid uuid REFERENCES app_account, settlement_period_uuid uuid,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE UNIQUE INDEX test_attendance_assignment ON worker_attendance_record(assignment_uuid) WHERE deleted_at IS NULL;
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
