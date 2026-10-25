BEGIN;

ALTER TABLE public.work_schedule_day
    ADD COLUMN male_charge_rate numeric(12, 0),
    ADD COLUMN female_charge_rate numeric(12, 0),
    ADD CONSTRAINT work_schedule_day_male_charge_rate_check
        CHECK (male_charge_rate BETWEEN 0 AND 999999999999),
    ADD CONSTRAINT work_schedule_day_female_charge_rate_check
        CHECK (female_charge_rate BETWEEN 0 AND 999999999999);

COMMENT ON COLUMN public.work_schedule_day.male_charge_rate IS 'Optional farm charge per person in the MEN assignment area, KRW; not worker pay';
COMMENT ON COLUMN public.work_schedule_day.female_charge_rate IS 'Optional farm charge per person in the WOMEN assignment area, KRW; not worker pay';

COMMIT;
