// 전역 변수로 데이터 저장
let allOrders = [];

// 상태 한글 매핑
const STATUS_MAP = {
    'PAYMENT_WAITING': '입금대기',
    'PAYED': '결제완료',
    'DELIVERING': '배송중',
    'DELIVERED': '배송완료',
    'PURCHASE_DECIDED': '구매확정',
    'EXCHANGED': '교환',
    'CANCELED': '취소',
    'RETURNED': '반품',
    'CANCELED_BY_NOPAYMENT': '미입금취소',
    'PRODUCT_PREPARE': '상품준비중',
    'DELIVERY_PREPARE': '배송준비중'
};

function getKoreanStatus(status) {
    if (!status) return '';
    return STATUS_MAP[status] || status;
}

document.addEventListener('DOMContentLoaded', () => {
    loadOrders();

    // 동기화 버튼 이벤트
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => loadOrders(true));
    }

    // 필터 이벤트 리스너
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('searchInput');

    if (statusFilter) statusFilter.addEventListener('change', filterOrders);
    if (searchInput) searchInput.addEventListener('keyup', filterOrders);
});

async function loadOrders(isSync = false) {
    const loading = document.getElementById('loading');
    const orderList = document.getElementById('orderList');
    // 버튼 Selector
    const syncBtn = document.getElementById('syncBtn');
    const lastSynced = document.getElementById('lastSynced');

    loading.classList.add('active');
    if (syncBtn) syncBtn.disabled = true;

    if (isSync) {
        orderList.innerHTML = '<div class="no-data" id="syncProgress">네이버와 동기화 중입니다...<br>진행률: 0%</div>';
    } else {
        // 동기화 아닐 땐 일단 비워두고 로딩 완료 후 렌더링
        orderList.innerHTML = '';
    }

    try {
        if (isSync) {
            // [동기화 로직]
            // 90일치를 5일 단위로 끊어서 요청 (총 18회)
            const totalDays = 90;
            const chunkSize = 5;
            const iterations = Math.ceil(totalDays / chunkSize);

            for (let i = 0; i < iterations; i++) {
                const offset = i * chunkSize;
                const progress = Math.round((i / iterations) * 100);

                const progressEl = document.getElementById('syncProgress');
                if (progressEl) {
                    progressEl.innerHTML = `네이버와 동기화 중입니다...<br>구간: ${offset}~${Math.min(offset + chunkSize, totalDays)}일 전<br>진행률: ${progress}%`;
                }

                // 첫 번째 청크(가장 최신 데이터)일 때만 'clear=true'를 보내서 기존 시트 내용을 지움
                const clearParam = (i === 0) ? '&clear=true' : '';
                const url = `/api/orders?sync=true&days=${chunkSize}&offset=${offset}${clearParam}`;
                const response = await fetch(url);

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(`동기화 중 오류 (구간 ${offset}): ${data.error || response.statusText}`);
                }

                // API 속도 제한 방지를 위한 안전 딜레이 (1.5초)
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            if (lastSynced) {
                lastSynced.textContent = '동기화 완료!';
                setTimeout(() => { lastSynced.textContent = ''; }, 5000);
            }

            // 동기화 완료 후 일반 데이터 로드 재호출
            await loadOrders(false);
            return;

        } else {
            // [일반 조회 로직] 구글시트 또는 DB 조회
            const response = await fetch('/api/orders');
            const data = await response.json();

            if (response.ok) {
                allOrders = data.orders; // 전역 변수 저장
                updateStatusFilter(allOrders); // 상태 옵션 갱신
                filterOrders(); // 초기 필터링 및 렌더링
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
            if (syncBtn) syncBtn.disabled = false;
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
    // 구글 시트 데이터는 딕셔너리 리스트이므로 status 키 사용
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
                    <td style="text-align: left; padding-left: 10px;">
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
