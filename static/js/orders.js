// 전역 변수로 데이터 저장
let allOrders = [];

// 상태 한글 매핑
const STATUS_MAP = {
    'PAYMENT_WAITING': '입금대기',
    'PAYED': '결제완료 (신규주문)',
    'DELIVERING': '배송중',
    'DELIVERED': '배송완료',
    'PURCHASE_DECIDED': '구매확정',
    'EXCHANGED': '교환',
    'CANCELED': '취소',
    'RETURNED': '반품',
    'CANCELED_BY_NOPAYMENT': '미입금취소',
    'PRODUCT_PREPARE': '발송대기 (상품준비중)',
    'DELIVERY_PREPARE': '발송대기 (배송준비중)'
};

function getKoreanStatus(status) {
    if (!status) return '';
    return STATUS_MAP[status] || status;
}

document.addEventListener('DOMContentLoaded', () => {
    loadOrders();

    // 필터 이벤트 리스너
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchInput');

    if (statusFilter) statusFilter.addEventListener('change', filterOrders);
    if (searchInput) searchInput.addEventListener('keyup', filterOrders);
});

async function loadOrders(isSync = false) {
    const loading = document.getElementById('loading');
    const orderList = document.getElementById('orderList');
    const lastSynced = document.getElementById('lastSynced');

    loading.classList.add('active');

    if (isSync) {
        orderList.innerHTML = '<div class="no-data" id="syncProgress">네이버와 동기화 중입니다...<br>진행률: 0%</div>';
    } else {
        // 동기화 아닐 땐 일단 비워두고 로딩 완료 후 렌더링
        orderList.innerHTML = '';
    }

    try {
        if (isSync) {
            // [강제 캐시 갱신] 최근 90일 데이터를 15일 단위로 끊어서 요청 (API 속도 제한 고려)
            const totalDays = 90;
            const chunkSize = 15;
            const iterations = Math.ceil(totalDays / chunkSize);

            // 기존 누적 부분은 백엔드 응답을 그대로 사용하므로 accumulatedOrders 변수는 삭제함

            for (let i = 0; i < iterations; i++) {
                const offset = i * chunkSize;
                const progress = Math.round((i / iterations) * 100);

                const progressEl = document.getElementById('syncProgress');
                if (progressEl) {
                    progressEl.innerHTML = `네이버와 동기화 중입니다...<br>구간: ${offset}~${Math.min(offset + chunkSize, totalDays)}일 전<br>진행률: ${progress}%`;
                }

                // API 호출 (구글 시트clear 요소는 뺐고, 단순히 메모리에 덮어씌움)
                const url = `/api/orders?sync=true&days=${chunkSize}&offset=${offset}`;
                const response = await fetch(url);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(`동기화 중 오류 (구간 ${offset}): ${data.error || response.statusText}`);
                }

                // 받아온 데이터 누적
                if (data.orders) {
                    accumulatedOrders = accumulatedOrders.concat(data.orders);
                }

                // API 한도 타격을 줄이기 위한 안전 딜레이
                if (i < iterations - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }

            // 동기화 완료 시 최종 렌더링 (이미 루프에서 실시간으로 그렸지만 혹시 모를 누락 확인)
            if (lastSynced) {
                lastSynced.textContent = '최근 90일 동기화 완료!';
                setTimeout(() => { lastSynced.textContent = ''; }, 5000);
            }
            return;
        } else {
            // [캐시 우선 조회] 기본적으로 3일치 동기화 또는 기존 서버에 누적된 전체 캐시를 가져옴 (타임아웃 방지)
            const response = await fetch('/api/orders');
            const data = await response.json();

            if (response.ok) {
                allOrders = data.orders; // 전역 변수 저장 (항상 전체 누적 캐시가 내려옴)
                updateStatusFilter(allOrders); // 상태 옵션 갱신
                filterOrders(); // 초기 필터링 및 렌더링

                // 사용자가 요청한 "최근 90일치를 봐야해" 니즈를 충족하기 위해,
                // 최초 1회 방문 시에는 502 타임아웃 없이 안전하게 15일 단위로 쪼개서 90일을 가져오는
                // "동기화(isSync=true)" 프로세스를 백그라운드에서 자동 실행합니다.
                if (!sessionStorage.getItem('synced90days')) {
                    sessionStorage.setItem('synced90days', 'true');
                    // 약간의 딜레이 후 동기화 자동 시작
                    setTimeout(() => {
                        const syncBtn = document.getElementById('refreshBtn');
                        if (syncBtn) {
                            syncBtn.click();
                        }
                    }, 500);
                }
            } else {
                throw new Error(data.error || '주문 정보를 불러오는데 실패했습니다.');
            }
        }
    } catch (error) {
        console.error(error);
        orderList.innerHTML = `<div class="error">오류가 발생했습니다: ${error.message}</div>`;
    } finally {
        if (!isSync) {
            loading.classList.remove('active');
        }
    }
}

// 상태 필터 옵션 동적 생성
function updateStatusFilter(orders) {
    const statusFilter = document.getElementById('statusFilter');
    if (!statusFilter) return;

    // 현재 선택된 값 유지
    const currentValue = statusFilter.value;

    // 유니크한 상태 값 추출 (null/undefined 제외)
    // 메모리에 캐싱된 네이버 API 원본 상태값 사용
    const statuses = [...new Set(orders.map(o => o.status))].filter(s => s).sort();

    // 옵션 초기화 (전체 상태 포함)
    statusFilter.innerHTML = '<option value="">전체 상태</option>';

    statuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = getKoreanStatus(status); // 한글 표기 적용
        statusFilter.appendChild(option);
    });

    // 값 복원 (만약 이전 선택값이 새 목록에 없으면 '전체'가 됨)
    if (currentValue && statuses.includes(currentValue)) {
        statusFilter.value = currentValue;
    }
}

// 필터링 및 렌더링 호출
function filterOrders() {
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchInput');

    const statusValue = statusFilter ? statusFilter.value : '';
    const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = allOrders.filter(order => {
        // 1. 상태 필터
        if (statusValue && order.status !== statusValue) return false;

        // 2. 검색어 필터 (주문번호, 구매자명, 상품명, 옵션)
        // 데이터가 문자열이 아닐 수도 있으므로 String() 변환 필수
        if (searchValue) {
            const searchTargets = [
                order.product_order_id,
                order.order_id,
                order.buyer_name,
                order.product_name,
                order.product_option
            ].map(s => String(s || '').toLowerCase());

            return searchTargets.some(t => t.includes(searchValue));
        }

        return true;
    });

    renderOrders(filtered);
}

function renderOrders(orders) {
    const orderList = document.getElementById('orderList');
    orderList.innerHTML = '';

    if (!orders || orders.length === 0) {
        orderList.innerHTML = '<div class="no-data">검색 결과가 없습니다.</div>';
        return;
    }

    // 주문번호(order_id) 기준으로 그룹화
    const groupedOrders = {};
    orders.forEach(order => {
        if (!groupedOrders[order.order_id]) {
            groupedOrders[order.order_id] = [];
        }
        groupedOrders[order.order_id].push(order);
    });

    const table = document.createElement('table');
    table.className = 'order-table';

    // [UI 개선] colgroup으로 열 너비 고정
    const colgroup = `
        <colgroup>
            <col style="width: 50px;">
            <col style="width: 140px;">
            <col style="width: 220px;">
            <col style="width: 110px;">
            <col style="width: auto;">
            <col style="width: 70px;">
            <col style="width: 130px;">
        </colgroup>
    `;

    table.innerHTML = `
        ${colgroup}
        <thead>
            <tr>
                <th></th>
                <th>주문일시</th>
                <th>주문번호</th>
                <th>상태</th>
                <th>상품명 / 옵션</th>
                <th>수량</th>
                <th>구매자</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // 최신 주문 역순 정렬
    const sortedOrderIds = Object.keys(groupedOrders).sort((a, b) => b.localeCompare(a));

    sortedOrderIds.forEach(orderId => {
        const group = groupedOrders[orderId];
        const firstOrder = group[0];
        const isMulti = group.length > 1;
        const totalQty = group.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);

        // 대표 상태 (첫 번째 상품 기준)
        const mainStatus = firstOrder.status;
        const statusClass = getStatusClass(mainStatus);
        const statusText = getKoreanStatus(mainStatus);

        // 그룹 헤더 행
        const tr = document.createElement('tr');
        tr.className = 'order-group-header';
        tr.onclick = () => toggleDetails(orderId);

        // 상품명 요약: 대표 행에서는 옵션을 제외하고 상품명만 표시
        let productSummary = firstOrder.product_name;
        if (isMulti) {
            productSummary += ` 외 ${group.length - 1}건`;
        }

        tr.innerHTML = `
            <td>
                <div class="toggle-container">
                    <span class="toggle-icon"></span>
                </div>
            </td>
            <td>${formatDate(firstOrder.order_date)}</td>
            <td>${orderId}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${productSummary}</td>
            <td>${totalQty}</td>
            <td>${firstOrder.buyer_name}</td>
        `;
        tbody.appendChild(tr);

        // 상세 내용 행 (항상 생성하되 display: none)
        const trDetail = document.createElement('tr');
        trDetail.className = 'order-group-details';
        trDetail.id = `details-${orderId}`;
        trDetail.style.display = 'none';

        // 상세 테이블도 동일한 colgroup 구조를 써서 열 정렬 맞춤
        let detailsHtml = `
            <td colspan="7" style="padding: 0;">
                <div class="detail-container">
                    <table class="detail-table" style="width: 100%; table-layout: fixed; margin: 0;">
                        ${colgroup}
                        <tbody>
        `;

        group.forEach(item => {
            const itemStatusClass = getStatusClass(item.status);
            const itemStatusText = getKoreanStatus(item.status);

            detailsHtml += `
                <tr>
                    <td style="color: #cbd5e1; text-align: center;">└</td>
                    <td></td> <!-- 날짜 공란 -->
                    <td>${item.product_order_id}</td> <!-- 품목주문번호 -->
                    <td><span class="status-badge ${itemStatusClass}">${itemStatusText}</span></td>
                    <td style="text-align: center;">
                        <div style="font-weight: 500;">${item.product_name}</div>
                        <div class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">${item.product_option || '옵션 없음'}</div>
                    </td>
                    <td>${item.quantity}</td>
                    <td></td> <!-- 구매자 공란 -->
                </tr>
            `;
        });

        detailsHtml += `
                        </tbody>
                    </table>
                </div>
            </td>
        `;
        trDetail.innerHTML = detailsHtml;
        tbody.appendChild(trDetail);
    });

    orderList.appendChild(table);
}

function toggleDetails(orderId) {
    const detailRow = document.getElementById(`details-${orderId}`);
    if (detailRow) {
        const isHidden = detailRow.style.display === 'none';
        detailRow.style.display = isHidden ? 'table-row' : 'none';

        // 헤더 행에 'expanded' 클래스 토글 (CSS 애니메이션용)
        const headerRow = detailRow.previousElementSibling;
        if (headerRow) {
            if (isHidden) {
                headerRow.classList.add('expanded');
            } else {
                headerRow.classList.remove('expanded');
            }
        }
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${yy}-${mm}-${dd} ${hh}:${min}`;
    } catch (e) {
        return dateString;
    }
}

function getStatusClass(status) {
    if (!status) return 'status-default';
    const s = String(status).toUpperCase();
    if (s.includes('PAYED') || s.includes('PAYMENT') || s.includes('PREPARE')) return 'status-payed';
    if (s.includes('DELIVER')) return 'status-dispatched';
    if (s.includes('CANCEL') || s.includes('RETURN') || s.includes('EXCHANGE')) return 'status-canceled';
    return 'status-default';
}
