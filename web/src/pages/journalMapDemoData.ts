export type Point = {
    x: number;
    y: number;
};
export type DemoJournal = {
    id: string;
    date: string;
    client: string;
    site: string;
    body: string;
    task: string;
    people: number;
    fieldId?: string;
};
export type DemoField = {
    id: string;
    points: string;
    name: string;
};
export type DemoPin = Point & {
    id: string;
    journalId: string;
    memo: string;
};
export function demoData(dense: boolean) {
    const fields: DemoField[] = Array.from({ length: dense ? 12 : 5 }, (_, i) => {
        const x = 130 + (i % 4) * 185, y = 130 + Math.floor(i / 4) * 160;
        return { id: `field-${i}`, name: `예시 ${i + 1}밭`, points: `${x},${y} ${x + 140},${y - 12} ${x + 150},${y + 95} ${x + 12},${y + 108}` };
    });
    const work: DemoJournal[] = fields.flatMap((field, i) => [0, 1].map(day => ({
        id: `work-${i}-${day}`, date: `2026-10-${String(15 + day * 3 + i % 3).padStart(2, '0')}`,
        client: `가상 ${['김농주', '윤농주', '박농주'][i % 3]}`, site: field.name,
        fieldId: field.id, task: day ? '양파 선별' : '마늘 심기', people: 3 + i % 5,
        body: `작업 결과가 기록된 예시입니다.\n${day ? '선별 작업 마무리.' : '오전 작업 완료. 남은 구역은 다음 작업에서 진행.'}`,
    })));
    work.push({ id: 'work-no-area', date: '2026-10-20', client: '가상 이농주', site: '영역 없는 현장', task: '밭 정리', people: 2, body: '영역을 등록하지 않은 작업 기록입니다.' });
    const sales: DemoJournal[] = Array.from({ length: 4 }, (_, i) => ({ id: `sales-${i}`, date: `2026-10-${18 + i}`, client: '', site: '', task: '', people: 0,
        body: ['구지, 덕곡 방면 작물 상태 확인.\n양파 예정. 추석 후 연락하기로 함.', '마늘 심을 밭 발견. 전화번호는 받지 못함.\n약 1만평이라는 이야기를 들음.', '여러 농가와 통화한 내용.\n마늘과 양파 작업 시기 확인.', '장소를 연결하지 않은 영업 기록.\n잠재 작업에 관한 메모.'][i] }));
    const pins: DemoPin[] = Array.from({ length: dense ? 30 : 5 }, (_, i) => ({ id: `pin-${i}`, journalId: `sales-${i % 3}`,
        x: dense ? 390 + (i % 6) * 24 : 180 + (i % 3) * 250, y: dense ? 260 + Math.floor(i / 6) * 28 : 200 + Math.floor(i / 3) * 240,
        memo: ['마늘', '양파 예정', '추석 후 연락', '약 1만평', ''][i % 5] }));
    return { fields, work, sales, pins };
}
export function filterJournals(rows: DemoJournal[], from: string, to: string, query: string) {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to) &&
        `${row.body} ${row.client} ${row.site} ${row.task}`.toLocaleLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date));
}
export const shortMemo = (value: string) => Array.from(value.replace(/[\r\n]/g, '')).slice(0, 10).join('');
export function labelIds(pins: DemoPin[], selected: string | null, scale: number) {
    const shown: DemoPin[] = [];
    for (const pin of [...pins].sort((a, b) => Number(b.id === selected) - Number(a.id === selected))) {
        if (pin.id === selected || !shown.some(other => Math.abs(other.x - pin.x) * scale < 140 && Math.abs(other.y - pin.y) * scale < 44))
            shown.push(pin);
    }
    return new Set(shown.map(pin => pin.id));
}
