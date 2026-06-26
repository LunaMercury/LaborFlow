BEGIN;

DO $$
DECLARE
    account_record record;
    owner_uuid_by_name uuid;
    site_uuid_by_key uuid;
    target_date date;
    date_index integer;
    slot_index integer;
    job_count integer;
    template_index integer;
    template_record record;
    next_address text;
    next_male_count smallint;
    next_female_count smallint;
BEGIN
    CREATE TEMP TABLE schedule_seed_template (
        template_no integer PRIMARY KEY,
        owner_name varchar(100) NOT NULL,
        business_name varchar(150) NOT NULL,
        site_name varchar(150) NOT NULL,
        address_prefix text NOT NULL,
        work_description text NOT NULL,
        work_type_codes text[] NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        male_base smallint NOT NULL,
        female_base smallint NOT NULL,
        memo text
    ) ON COMMIT DROP;

    INSERT INTO schedule_seed_template (
        template_no,
        owner_name,
        business_name,
        site_name,
        address_prefix,
        work_description,
        work_type_codes,
        start_time,
        end_time,
        male_base,
        female_base,
        memo
    )
    VALUES
        (1, '김농주', '김농주 농장', '동문 제1농장', '동문리 128', '마늘 뽑기', ARRAY['garlic_harvesting', 'garlic_branching'], TIME '06:30', TIME '15:00', 4, 7, '새참은 현장 제공, 장갑 지참'),
        (2, '박농주', '박농주 농장', '서문 마늘밭', '서문리 77', '마늘 삭태 자르기', ARRAY['garlic_branching', 'garlic_work'], TIME '07:00', TIME '15:30', 2, 8, '칼 작업 가능자 우선'),
        (3, '이농주', '이농주 농장', '중앙 선별장', '시장길 9', '마늘 선별', ARRAY['garlic_sorting', 'garlic_meshing'], TIME '08:00', TIME '17:00', 1, 9, '선별대 2개 운영'),
        (4, '최농주', '최농주 농장', '남문 창고', '남문로 42', '마늘 톤백', ARRAY['garlic_tonbag', 'garlic_meshing'], TIME '07:00', TIME '16:00', 5, 3, '지게차 동선 확인'),
        (5, '정농주', '정농주 농장', '북문 하우스', '북문로 63', '비닐 벗기기', ARRAY['plastic_remove'], TIME '07:30', TIME '13:00', 3, 4, '오전 집중 작업'),
        (6, '한농주', '한농주 농장', '강변 양파밭', '강변길 21', '양파 뽑기', ARRAY['onion_harvesting', 'onion_branching'], TIME '06:00', TIME '14:30', 6, 5, '물통 개인 지참'),
        (7, '오농주', '오농주 농장', '서창 양파 선별장', '서창리 55', '양파 선별', ARRAY['onion_sorting', 'onion_meshing'], TIME '08:00', TIME '17:00', 2, 8, '선별 경험자 우선'),
        (8, '윤농주', '윤농주 농장', '동산 망작업장', '동산길 34', '양파 망작업', ARRAY['onion_meshing', 'onion_sorting'], TIME '07:30', TIME '16:30', 2, 7, '망 묶음 속도 중요'),
        (9, '장농주', '장농주 농장', '평야 톤백장', '평야로 102', '양파 톤백', ARRAY['onion_tonbag', 'onion_work'], TIME '07:00', TIME '16:00', 5, 4, '톤백 경험자 우선'),
        (10, '송농주', '송농주 농장', '상촌 복합작업장', '상촌길 18', '마늘 망작업', ARRAY['garlic_meshing', 'garlic_tonbag'], TIME '08:30', TIME '17:30', 2, 6, '작업량에 따라 연장 가능');

    date_index := 0;

    FOR target_date IN
        SELECT generated_date::date
        FROM generate_series(DATE '2026-06-26', DATE '2026-07-15', INTERVAL '1 day') AS generated_date
    LOOP
        date_index := date_index + 1;

        FOR account_record IN
            SELECT
                login_id,
                labor_agency_owner_uuid AS agency_owner_uuid,
                row_number() OVER (ORDER BY login_id)::integer AS account_index
            FROM public.app_account
            WHERE login_id IN ('test', 'test1')
                AND labor_agency_owner_uuid IS NOT NULL
            ORDER BY login_id
        LOOP
            job_count := 2 + ((date_index + account_record.account_index) % 3);

            FOR slot_index IN 0..(job_count - 1) LOOP
                template_index := ((date_index + slot_index + account_record.account_index) % 10) + 1;

                SELECT *
                INTO template_record
                FROM schedule_seed_template
                WHERE template_no = template_index;

                next_address := template_record.address_prefix || ' ' || (((date_index + slot_index) % 4) + 1)::text || '구역';
                next_male_count := (template_record.male_base + ((date_index + slot_index) % 3))::smallint;
                next_female_count := (template_record.female_base + ((date_index + account_record.account_index + slot_index) % 4))::smallint;

                SELECT uuid
                INTO owner_uuid_by_name
                FROM public.farm_owner
                WHERE canonical_name = template_record.owner_name
                ORDER BY created_at
                LIMIT 1;

                IF owner_uuid_by_name IS NULL THEN
                    INSERT INTO public.farm_owner (
                        canonical_name,
                        canonical_business_name
                    )
                    VALUES (
                        template_record.owner_name,
                        template_record.business_name
                    )
                    RETURNING uuid INTO owner_uuid_by_name;
                END IF;

                INSERT INTO public.labor_agency_farm_owner_profile (
                    agency_owner_uuid,
                    farm_owner_uuid,
                    local_name,
                    local_business_name
                )
                VALUES (
                    account_record.agency_owner_uuid,
                    owner_uuid_by_name,
                    template_record.owner_name,
                    template_record.business_name
                )
                ON CONFLICT (agency_owner_uuid, farm_owner_uuid) DO UPDATE
                SET local_name = EXCLUDED.local_name,
                    local_business_name = EXCLUDED.local_business_name;

                INSERT INTO public.farm_work_site (
                    agency_owner_uuid,
                    owner_uuid,
                    site_name,
                    farm_address,
                    male_required_count,
                    female_required_count,
                    work_description,
                    work_start_date,
                    work_end_date,
                    daily_start_time,
                    daily_end_time,
                    memo,
                    status
                )
                SELECT
                    account_record.agency_owner_uuid,
                    owner_uuid_by_name,
                    template_record.site_name,
                    next_address,
                    next_male_count,
                    next_female_count,
                    template_record.work_description,
                    target_date,
                    target_date,
                    template_record.start_time,
                    template_record.end_time,
                    template_record.memo,
                    'ACTIVE'
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.farm_work_site
                    WHERE agency_owner_uuid = account_record.agency_owner_uuid
                        AND work_start_date = target_date
                        AND daily_start_time = template_record.start_time
                        AND farm_address = next_address
                        AND work_description = template_record.work_description
                )
                RETURNING uuid INTO site_uuid_by_key;

                IF site_uuid_by_key IS NULL THEN
                    SELECT uuid
                    INTO site_uuid_by_key
                    FROM public.farm_work_site
                    WHERE agency_owner_uuid = account_record.agency_owner_uuid
                        AND work_start_date = target_date
                        AND daily_start_time = template_record.start_time
                        AND farm_address = next_address
                        AND work_description = template_record.work_description
                    ORDER BY created_at
                    LIMIT 1;
                END IF;

                INSERT INTO public.farm_work_site_work_type (
                    work_site_uuid,
                    work_type_uuid
                )
                SELECT site_uuid_by_key, wt.uuid
                FROM public.work_type wt
                WHERE wt.code = ANY(template_record.work_type_codes)
                ON CONFLICT DO NOTHING;

                site_uuid_by_key := NULL;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
