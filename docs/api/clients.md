# 거래처와 현장 API

[API 문서 홈](README.md) · [공통 계약](common.md) · [일정 API](schedule.md)

## 관계 모델

- `farm_owner`: 중앙 농장주 식별자. 응답의 `farmOwnerUuid` 및 일정의 `ownerUuid`다.
- `labor_agency_farm_owner_profile`: 현재 사무소가 보는 거래처 정보. 응답/경로의 `profileUuid`다.
- `labor_agency_farm_owner_site`: 거래처별 여러 현장. `workSites[].uuid` 및 일정의 `clientWorkSiteUuid`다.
- `farm_work_site`: 실제 일정 묶음이다. 거래처 현장 마스터와 다른 객체이며 일정 응답의 `workSiteId`다.

전화번호가 같은 중앙 농장주는 여러 사무소에 연결될 수 있다. 목록과 수정은 현재 사무소의 프로필만 대상으로 하며 다른 사무소 소속 여부는 노출하지 않는다.

주요 호출 화면은 `/clients`의 거래처 목록/추가/수정과 `/schedule`의 일정 추가/수정 자동완성이다.

## 요청과 응답

생성과 수정 본문은 같은 모양이다.

```json
{
  "name": "가상 농장주",
  "nickname": "동문 사장님",
  "businessName": "가상농장",
  "phone": "010-2345-6789",
  "bankAccount": "123-456-789012",
  "memo": "연락은 오후에",
  "workSites": [
    {
      "uuid": null,
      "siteName": "동문 제1현장",
      "farmAddress": "가상시 동문로 10",
      "memo": "진입로 확인"
    }
  ]
}
```

### 거래처 필드

| 필드 | 타입 | 생성 | 수정 및 정규화 |
|---|---|---|---|
| `name` | string | `nickname`과 둘 중 하나 필수 | 공백은 `null`; `name/nickname/businessName/phone` 중 하나는 있어야 함; DB 이름 `varchar(100)` |
| `nickname` | string | `name`과 둘 중 하나 필수 | 공백은 `null`; DB `varchar(100)` |
| `businessName` | string | 선택 | 공백은 `null`; DB `varchar(150)` |
| `phone` | string | 필수 | 공백은 `null`; 숫자만 남겨 `10..11`자리. 11자리는 하이픈 형식으로 표시, 10자리는 숫자 문자열 유지 |
| `bankAccount` | string | 선택 | 숫자만 남겨 `8..20`자리 |
| `memo` | string | 선택 | 공백은 `null`; 별도 길이 선검사 없음 |
| `workSites` | array/null | 빈 목록 허용 | `null`도 빈 목록으로 처리하며 전체 교체 |

수정에서는 전화번호를 비울 수 있다. 다만 이름, 호칭, 상호/농장명, 전화번호를 모두 비우면 거부한다.

### 현장 필드

| 필드 | 타입 | 규칙 |
|---|---|---|
| `uuid` | UUID/null | 기존 현장은 UUID, 새 현장은 `null`; 다른 거래처 현장 UUID는 거부 |
| `siteName` | string | 현장 객체에 값이 하나라도 있으면 필수, 최대 150자 |
| `farmAddress` | string | 선택, 공백은 `null` |
| `memo` | string | 선택, 공백은 `null` |

- 배열은 최대 100개다.
- 세 필드가 모두 빈 현장 행은 무시한다.
- 한 요청 안에서 `siteName + farmAddress`를 대소문자 무시 기준으로 중복 등록할 수 없다.
- 수정할 때 기존 현장을 먼저 모두 소프트 삭제하고 본문의 현장만 복원/생성한다. 따라서 `workSites`를 생략하거나 `null`로 보내면 모든 현장이 목록에서 사라진다.

응답:

```json
{
  "clients": [
    {
      "profileUuid": "11111111-1111-4111-8111-111111111111",
      "farmOwnerUuid": "22222222-2222-4222-8222-222222222222",
      "name": "가상 농장주",
      "nickname": "동문 사장님",
      "businessName": "가상농장",
      "phone": "010-2345-6789",
      "bankAccount": "123456789012",
      "memo": "연락은 오후에",
      "workSites": [
        {
          "uuid": "33333333-3333-4333-8333-333333333333",
          "siteName": "동문 제1현장",
          "farmAddress": "가상시 동문로 10",
          "memo": "진입로 확인"
        }
      ]
    }
  ]
}
```

## API

### `GET /api/clients`

- 목적/화면: `/clients` 거래처 목록과 상세.
- 쿼리: `loginId` string, 생략/공백 시 `test`.
- 성공: `200`, `ClientListResponse`.
- 범위: 현재 사무소의 활성·미삭제 거래처 프로필과 활성 현장만 반환.
- 재시도: 안전하다.
- 근거: `ClientsController.getClients`, `ClientsService.getClients`, `JdbcClientsDao.findClientsByLoginId`, `web/src/api/clientsApi.ts#fetchClients`.

### `POST /api/clients`

- 목적/화면: `/clients`의 거래처 추가.
- 쿼리: `loginId` 기본 `test`.
- 본문: 위 거래처/현장 요청.
- 성공: `200`, 생성 후 전체 `ClientListResponse`.
- 저장/부수 효과: 전화번호로 중앙 `farm_owner`를 재사용하거나 생성하고 현재 사무소 프로필, 민감 전화/계좌, 현장 마스터를 저장한다.
- 실패: 생성 시 이름/호칭 또는 전화 누락, 전화/계좌 형식, 같은 사무소 전화 중복, 현장 개수/이름/중복 오류.
- 재시도: 멱등키 없음. 성공 여부가 불명확한 재요청은 중복 전화 `409`가 될 수 있다.
- 근거: `ClientsController.createClient`, `ClientsService.createClientAndReturnFarmOwnerUuid`, `JdbcClientsDao.replaceClientWorkSites`, `ClientsPage`, `createClient`.

### `PATCH /api/clients/{profileUuid}`

- 목적/화면: `/clients` 상세의 인라인 수정.
- 경로: 현재 사무소의 거래처 `profileUuid` UUID.
- 쿼리: `loginId` 기본 `test`.
- 본문: 위 전체 요청. 부분 병합이 아니라 거래처 필드 갱신과 현장 전체 교체다.
- 성공: `200`, 수정 후 전체 목록.
- 실패: 다른 사무소/삭제 프로필은 `400`; 다른 현재 거래처와 전화 중복은 `409`.
- 재시도: 같은 UUID 현장 목록은 다시 복원되지만 수정 시각 등이 바뀐다. 네트워크 계층의 엄격한 멱등성은 보장하지 않는다.
- 근거: `ClientsController.updateClient`, `ClientsService.updateClient`, `JdbcClientsDao.updateClientProfile/replaceClientWorkSites`, `ClientsPage`, `updateClient`.

### `DELETE /api/clients/{profileUuid}`

- 목적/화면: 거래처 수정 상태의 거래처 삭제.
- 경로/범위: `profileUuid`와 `loginId`의 사무소가 일치하는 행만 갱신된다.
- 성공: `200`, 삭제 후 전체 목록.
- 삭제 방식: `labor_agency_farm_owner_profile.status = ARCHIVED`, `deleted_at = now()`로 소프트 삭제한다. 중앙 `farm_owner`와 기존 일정은 직접 삭제하지 않는다.
- 반복 호출: DAO는 두 번째 요청에서 0행 갱신을 오류로 바꾸지 않으므로 현재는 다시 `200`과 목록을 반환할 수 있다.
- 근거: `ClientsController.deleteClient`, `ClientsService.deleteClient`, `JdbcClientsDao.softDeleteClientProfile`, `ClientsPage`, `deleteClient`.

## 일정에서 현장을 저장하는 내부 계약

별도 공개 Controller 경로는 없고 `ScheduleService`가 `ClientsService.resolveWorkSite`를 호출한다.

- `clientWorkSiteUuid`가 있으면 반드시 선택한 농장주의 현재 사무소 현장이어야 한다. 요청의 `siteName/address` 대신 마스터 값을 사용하고 `siteMemo`만 갱신한다.
- UUID 없이 `siteName`이 있으면 해당 거래처의 현장 마스터로 저장하거나 기존 동일 현장을 재사용한다. 이후 일정 추가 자동완성에 나타난다.
- UUID와 `siteName`이 모두 없으면 현장 마스터를 만들지 않는다. 요청 주소는 일정 스냅샷에만 사용할 수 있지만 일정 생성/수정 자체는 최종 주소가 필수다.

거래처를 선택하지 않은 일정 생성은 `ownerUuid: null`과 함께 `ownerName` 또는 `ownerNickname`, 유효한 `ownerPhone`을 보내야 한다. Schedule 서비스가 거래처를 먼저 생성한 뒤 일정을 만든다. 자세한 계약은 [schedule.md](schedule.md#일정-생성)를 참고한다.
