import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { HistoryDialog } from '../components/AssignmentHistoryModal';
import journal from './JournalPages.module.css';
import styles from './JournalMapDemo.module.css';
import { demoData, filterJournals, labelIds, shortMemo, type DemoPin, type Point } from './journalMapDemoData';
export default function JournalMapDemo() {
    const sales = window.location.pathname.endsWith('/sales');
    const [dense, setDense] = useState(false);
    const data = useMemo(() => demoData(dense), [dense]);
    const [pins, setPins] = useState(data.pins);
    const [from, setFrom] = useState('2026-10-15'), [to, setTo] = useState('2026-10-23'), [query, setQuery] = useState('');
    const [view, setView] = useState('map');
    const [selected, setSelected] = useState<string | null>(null);
    const [detail, setDetail] = useState<string | null>(null);
    const [camera, setCamera] = useState({ x: 0, y: 0, w: 1000 });
    const [draft, setDraft] = useState<{
        id?: string;
        journalId: string;
        point: Point | null;
        memo: string;
        placing: boolean;
    } | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const svg = useRef<SVGSVGElement>(null);
    const drag = useRef<{
        x: number;
        y: number;
        cx: number;
        cy: number;
        target: string | null;
    } | null>(null);
    const moved = useRef(false);
    const [width, setWidth] = useState(700);
    useEffect(() => {
        const element = svg.current;
        if (!element)
            return;
        const update = () => setWidth(element.getBoundingClientRect().width || 700);
        const observer = new ResizeObserver(update);
        observer.observe(element);
        update();
        return () => observer.disconnect();
    }, [view]);
    const rows = filterJournals(sales ? data.sales : data.work, from, to, query);
    const visiblePins = pins.filter(pin => rows.some(row => row.id === pin.journalId))
        .sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
    const visibleFields = data.fields.filter(field => rows.some(row => row.fieldId === field.id));
    const labels = labelIds(visiblePins, selected, width / camera.w);
    const selectedPin = visiblePins.find(pin => pin.id === selected);
    const selectedRows = rows.filter(row => sales ? row.id === selectedPin?.journalId : row.fieldId === selected);
    const opened = rows.find(row => row.id === detail);
    const reset = (nextDense = dense) => {
        setDense(nextDense);
        setPins(demoData(nextDense).pins);
        setSelected(null);
        setDetail(null);
        setDraft(null);
        setCamera({ x: 0, y: 0, w: 1000 });
        setFrom('2026-10-15');
        setTo('2026-10-23');
        setQuery('');
        setCollapsed(false);
    };
    const zoom = (factor: number) => setCamera(c => { const w = Math.max(200, Math.min(1600, c.w * factor)); return { x: c.x + (c.w - w) / 2, y: c.y + (c.w - w) * .7 / 2, w }; });
    const position = (event: PointerEvent<SVGSVGElement>) => {
        const matrix = svg.current?.getScreenCTM();
        if (!matrix)
            return { x: 0, y: 0 };
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return { x: Math.round(point.x), y: Math.round(point.y) };
    };
    const choose = (id: string) => { if (!moved.current && !draft?.placing) {
        setSelected(id);
        setCollapsed(false);
    } };
    const startPlace = (journalId: string, pin?: DemoPin) => { setDetail(null); setView('map'); setDraft({ id: pin?.id, journalId, point: pin ? { x: pin.x, y: pin.y } : null, memo: pin?.memo || '', placing: !pin }); };
    return <main className={styles.page}>
    <div className={styles.notice}><strong>지도 시안 · 예시 데이터 · 서버에 저장되지 않음</strong><span>새로고침 시 초기화됩니다. 실제 지도가 아닌 배치·조작 확인용 시안입니다.</span></div>
    <header className={journal.journalHeader}><h1>{sales ? '영업일지' : '작업일지'} 지도 시안</h1><button className={journal.secondaryButton} onClick={() => reset()}>초기화</button></header>
    <nav className={styles.toolbar} aria-label="시안 페이지"><a href="/dev/journal-map/work">작업일지</a><a href="/dev/journal-map/sales">영업일지</a><label>예시 구성 <select value={dense ? 'dense' : 'basic'} onChange={e => reset(e.target.value === 'dense')}><option value="basic">기본 예시</option><option value="dense">밀집 예시</option></select></label></nav>
    <div className={journal.filterBar}>
      <label className={journal.filterField}>시작일<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label className={journal.filterField}>종료일<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label>
      <label className={`${journal.filterField} ${journal.searchField}`}>본문·현장 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    {from && to && from > to ? <p role="alert">종료일을 시작일 이후로 선택해 주세요.</p> : null}
    <div className={styles.switcher} aria-label="보기 방식">{['list', 'map'].map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'list' ? '목록' : '지도'}</button>)}</div>
    <div className={styles.workspace}>
      <section className={`${styles.list} ${view !== 'list' ? styles.mobileHidden : ''}`} aria-label="예시 일지 목록">
        <h2>{rows.length}건의 {sales ? '영업 기록' : '작업 결과'}</h2>
        {!rows.length ? <p>검색 결과가 없습니다.</p> : rows.map(row => <article key={row.id}>
          <button className={styles.record} onClick={() => { setDetail(row.id); setDraft(null); }}><time>{row.date}</time><strong>{sales ? row.body.split('\n')[0] : `${row.client} · ${row.site}`}</strong><span>{sales ? row.body.slice(0, 65) : `${row.task} · 실제 ${row.people}명`}</span></button>
          <small>{sales ? `${pins.filter(p => p.journalId === row.id).length}개 장소 연결` : row.fieldId ? '예시 작업 구역' : '영역 미등록 기록'}</small>
          {sales ? <button className={journal.secondaryButton} onClick={() => startPlace(row.id)}>장소 추가</button> : null}
        </article>)}
      </section>
      <section className={`${styles.mapPanel} ${view !== 'map' ? styles.mobileHidden : ''}`} aria-label="가상 지도">
        <div className={styles.toolbar}><strong>{sales ? '영업 중 기록한 장소' : '예시 작업 구역'}</strong><div className={styles.tools}>
          <button title="확대" aria-label="지도 확대" onClick={() => zoom(.75)}>+</button><button title="축소" aria-label="지도 축소" onClick={() => zoom(1.33)}>−</button><button title="지도 위치 초기화" aria-label="지도 위치 초기화" onClick={() => setCamera({ x: 0, y: 0, w: 1000 })}>↺</button>
        </div></div>
        {draft?.placing ? <p role="status">지도를 눌러 위치를 선택하세요. 끌면 지도만 이동합니다.</p> : null}
        <svg ref={svg} className={`${styles.canvas} ${draft?.placing ? styles.placing : ''}`} viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.w * .7}`} aria-label="이동 가능한 가상 지도 캔버스" onWheel={e => { if (e.ctrlKey)
        zoom(e.deltaY > 0 ? 1.1 : .9); }} onPointerDown={e => { if (e.button !== 0)
        return; setWidth(e.currentTarget.getBoundingClientRect().width); moved.current = false; drag.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y, target: (e.target as Element).closest('[data-feature]')?.getAttribute('data-feature') || null }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const d = drag.current; if (!d)
        return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 5)
        moved.current = true; if (moved.current) {
        const scale = camera.w / e.currentTarget.getBoundingClientRect().width;
        setCamera(c => ({ ...c, x: d.cx - dx * scale, y: d.cy - dy * scale }));
    } }} onPointerUp={e => { const d = drag.current; if (!d)
        return; drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); if (!moved.current && draft?.placing)
        setDraft({ ...draft, point: position(e), placing: false });
    else if (!moved.current && d.target)
        choose(d.target); }} onPointerCancel={() => { drag.current = null; moved.current = true; }}>
          <defs><pattern id="demo-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" className={styles.grid}/></pattern></defs>
          <rect x="-3000" y="-3000" width="7000" height="7000" className={styles.land}/><rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#demo-grid)"/>
          <g pointerEvents="none"><path d="M-100 600 Q450 600 500 390 T1100 150" className={styles.river}/><path d="M-100 80L1100 660M70 -100L900 850" className={styles.road}/><text x="90" y="90" className={styles.mapText}>가상 들녘 · 축척/필지 정보 없음</text></g>
          {!sales ? visibleFields.map(field => <polygon data-feature={field.id} key={field.id} points={field.points} className={selected === field.id ? styles.selectedField : styles.field} role="button" tabIndex={0} aria-label={`${field.name} 작업 내역`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelected(field.id);
            setCollapsed(false);
        } }}/>) : visiblePins.map(pin => <g data-feature={pin.id} key={pin.id} transform={`translate(${pin.x} ${pin.y})`} role="button" tabIndex={0} aria-label={`${pin.memo || '메모 없는 장소'} 선택`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelected(pin.id);
            setCollapsed(false);
        } }}>
            <g transform={`scale(${camera.w / width})`}><circle cy="-20" r="24" className={styles.hit}/><path d="M0 0C-22-25-12-38 0-38S22-25 0 0" className={selected === pin.id ? styles.selectedPin : styles.pin}/><circle cy="-25" r="4" className={styles.pinDot}/>
            {labels.has(pin.id) && pin.memo ? <g className={styles.pinLabel}><rect x={-Math.max(35, Array.from(pin.memo).length * 7)} y="-68" width={Math.max(70, Array.from(pin.memo).length * 14)} height="25" rx="4"/><text y="-51" textAnchor="middle">{pin.memo}</text></g> : null}
          </g></g>)}
          {draft?.point ? <g transform={`translate(${draft.point.x} ${draft.point.y})`} pointerEvents="none"><circle r="13" className={styles.selectedPin}/><path d="M-20 0H20M0-20V20" className={styles.cross}/></g> : null}
        </svg>
        <small>{sales ? '핀은 방문 완료를 의미하지 않습니다.' : '반투명 다각형은 예시 작업 구역이며 실제 필지 경계·면적이 아닙니다.'}</small>
        <button className={styles.missing} onClick={() => setView('list')}>{sales ? `${rows.filter(r => !pins.some(p => p.journalId === r.id)).length}건 위치 없는 기록` : `${rows.filter(r => !r.fieldId).length}건 영역 미등록 기록`} · 목록에서 보기</button>
        {selectedRows.length && !draft ? <section className={styles.summary} aria-label="선택 요약"><div className={styles.toolbar}><strong>{sales ? selectedPin?.memo || '메모 없는 장소' : `${selectedRows[0].client} · ${selectedRows[0].site}`}</strong><div className={styles.tools}><button aria-label="요약 접기 펼치기" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '+' : '−'}</button><button aria-label="요약 닫기" onClick={() => setSelected(null)}>×</button></div></div>
          {!collapsed ? <><p>{sales ? '연결된 영업일지' : `선택 기간 작업 결과 ${selectedRows.length}건`}</p>{selectedRows.map(row => <button key={row.id} className={styles.record} onClick={() => setDetail(row.id)}>{row.date} · {sales ? '영업일지 상세' : `${row.task} · 실제 ${row.people}명 · 상세`}</button>)}
          {sales && selectedPin ? <div className={styles.toolbar}><button className={journal.secondaryButton} onClick={() => startPlace(selectedPin.journalId, selectedPin)}>장소 수정</button><button className={journal.dangerButton} onClick={() => { setPins(pins.filter(p => p.id !== selectedPin.id)); setSelected(null); }}>장소 연결 삭제</button></div> : null}</> : null}</section> : null}
        {draft ? <section className={styles.summary} aria-label="장소 편집"><strong>{draft.id ? '장소 수정' : '장소 추가'}</strong><p>{draft.point ? '위치를 선택했습니다.' : '위치를 먼저 선택해 주세요.'}</p><button className={journal.secondaryButton} onClick={() => setDraft({ ...draft, placing: true })}>위치 {draft.point ? '다시 선택' : '선택'}</button>
          <label className={journal.field}>짧은 메모 (선택 · 최대 10자)<input value={draft.memo} onChange={e => setDraft({ ...draft, memo: (e.nativeEvent as InputEvent).isComposing ? e.target.value : shortMemo(e.target.value) })} onCompositionEnd={e => setDraft({ ...draft, memo: shortMemo(e.currentTarget.value) })}/></label>
          <div className={styles.toolbar}><button className={journal.primaryButton} disabled={!draft.point || draft.placing} onClick={() => { if (!draft.point)
            return; const pin = { ...draft.point, id: draft.id || crypto.randomUUID(), journalId: draft.journalId, memo: shortMemo(draft.memo) }; setPins([...pins.filter(p => p.id !== pin.id), pin]); setSelected(pin.id); setDraft(null); setCollapsed(false); }}>{draft.id ? '수정 적용' : '추가'}</button><button className={journal.secondaryButton} onClick={() => setDraft(null)}>취소</button></div>
        </section> : null}
      </section>
    </div>
    {opened ? <HistoryDialog title="예시 일지 상세" onClose={() => setDetail(null)}><section className={styles.detail}><header className={styles.toolbar}><h2>예시 {sales ? '영업일지' : '작업일지'}</h2><button className={journal.secondaryButton} onClick={() => setDetail(null)}>지도로 돌아가기</button></header><time>{opened.date}</time>{!sales ? <p>{opened.client} · {opened.site}<br />{opened.task} · 실제 투입 {opened.people}명 (결과 기록)</p> : null}<p className={styles.body}>{opened.body}</p>{sales ? <><p>연결된 장소 {pins.filter(p => p.journalId === opened.id).length}개</p><button className={journal.primaryButton} onClick={() => startPlace(opened.id)}>장소 추가</button></> : null}</section></HistoryDialog> : null}
  </main>;
}
