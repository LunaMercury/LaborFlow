BEGIN;

UPDATE public.work_type
SET name = seed.name,
    description = seed.description,
    status = 'ACTIVE'
FROM (
    VALUES
        ('garlic_harvesting', '마늘 뽑기', '마늘을 뽑고 수확하는 작업'),
        ('garlic_branching', '마늘 삭태 자르기', '마늘 줄기와 삭태를 정리하는 작업'),
        ('garlic_tonbag', '마늘 톤백', '마늘을 톤백 단위로 옮기고 묶는 작업'),
        ('garlic_meshing', '마늘 망작업', '마늘을 망 단위로 포장하는 작업'),
        ('onion_sorting', '양파 선별', '양파를 크기와 상태별로 선별하는 작업'),
        ('onion_meshing', '양파 망작업', '양파를 망 단위로 포장하는 작업'),
        ('onion_harvesting', '양파 뽑기', '양파를 뽑고 수확하는 작업'),
        ('onion_branching', '양파 줄기 정리', '양파 줄기를 정리하는 작업'),
        ('plastic_remove', '비닐 벗기기', '밭 또는 하우스 비닐을 걷는 작업'),
        ('garlic_work', '마늘 작업', '마늘 관련 일반 작업'),
        ('onion_work', '양파 작업', '양파 관련 일반 작업'),
        ('onion_tonbag', '양파 톤백', '양파를 톤백 단위로 옮기는 작업')
) AS seed(code, name, description)
WHERE public.work_type.code = seed.code;

DO $$
DECLARE
    site_record record;
    next_owner_name varchar(100);
    next_owner_business_name varchar(150);
    next_site_name varchar(150);
    next_farm_address text;
    next_work_description text;
    next_memo text;
BEGIN
    FOR site_record IN
        SELECT s.uuid, s.owner_uuid, s.agency_owner_uuid, s.work_start_date, s.daily_start_time
        FROM public.farm_work_site s
        JOIN public.app_account a ON a.labor_agency_owner_uuid = s.agency_owner_uuid
        WHERE a.login_id IN ('test', 'test1')
    LOOP
        next_owner_name := NULL;
        next_owner_business_name := NULL;
        next_site_name := NULL;
        next_farm_address := NULL;
        next_work_description := NULL;
        next_memo := NULL;

        IF site_record.work_start_date = DATE '2026-06-24'
            AND site_record.daily_start_time = TIME '06:30' THEN
            next_owner_name := '김농주';
            next_owner_business_name := '김농주 농장';
            next_site_name := '동문 제1농장';
            next_farm_address := '동문리 128';
            next_work_description := '마늘 뽑기';
            next_memo := '집결 후 밭 입구에서 장갑과 수확망 배부';
        ELSIF site_record.work_start_date = DATE '2026-06-24'
            AND site_record.daily_start_time = TIME '07:00' THEN
            next_owner_name := '박농주';
            next_owner_business_name := '박농주 농장';
            next_site_name := '남부 창고';
            next_farm_address := '남부로 42';
            next_work_description := '마늘 톤백';
            next_memo := '지게차 동선 확보, 톤백 묶음 경험자 우선';
        ELSIF site_record.work_start_date = DATE '2026-06-24'
            AND site_record.daily_start_time = TIME '08:00' THEN
            next_owner_name := '이농주';
            next_owner_business_name := '이농주 농장';
            next_site_name := '중앙 선별장';
            next_farm_address := '시장길 9';
            next_work_description := '양파 선별';
            next_memo := '선별대 2개 운영, 점심 현장 제공';
        ELSIF site_record.work_start_date = DATE '2026-06-25'
            AND site_record.daily_start_time = TIME '06:00' THEN
            next_owner_name := '최농주';
            next_owner_business_name := '최농주 농장';
            next_site_name := '서문 밭';
            next_farm_address := '서문리 77';
            next_work_description := '양파 뽑기';
            next_memo := '오전 작업량 집중, 물통 개인 지참';
        ELSIF site_record.work_start_date = DATE '2026-06-25'
            AND site_record.daily_start_time = TIME '07:30' THEN
            next_owner_name := '정농주';
            next_owner_business_name := '정농주 농장';
            next_site_name := '북문 하우스';
            next_farm_address := '북문로 63';
            next_work_description := '비닐 벗기기';
            next_memo := '작업 후 폐비닐 묶음까지 정리';
        END IF;

        IF next_owner_name IS NOT NULL THEN
            UPDATE public.farm_owner
            SET canonical_name = next_owner_name,
                canonical_business_name = next_owner_business_name
            WHERE uuid = site_record.owner_uuid;

            UPDATE public.labor_agency_farm_owner_profile
            SET local_name = next_owner_name,
                local_business_name = next_owner_business_name
            WHERE agency_owner_uuid = site_record.agency_owner_uuid
                AND farm_owner_uuid = site_record.owner_uuid;

            UPDATE public.farm_work_site
            SET site_name = next_site_name,
                farm_address = next_farm_address,
                work_description = next_work_description,
                memo = next_memo
            WHERE uuid = site_record.uuid;
        END IF;
    END LOOP;
END $$;

COMMIT;
