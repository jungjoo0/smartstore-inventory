document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
});

async function loadOrders() {
    const loading = document.getElementById('loading');
    const orderList = document.getElementById('orderList');
    // 버튼 Selector 수정 (기존 .btn 클래스 사용 가정, 없으면 무시)
    const btn = document.querySelector('.btn-search') || document.querySelector('.btn');

    // 로딩 상태 표시
    loading.classList.add('active');
    if (btn) btn.disabled = true;
    orderList.innerHTML = '<div class="no-data">주문 정보를 불러오는 중입니다...</div>';

    try {
        const response = await fetch('/api/orders');
        const data = await response.json();

        if (response.ok) {
            renderOrders(data.orders);
        } else {
            throw new Error(data.error || '주문 정보를 불러오는데 실패했습니다.');
        }
    } catch (error) {
        orderList.innerHTML = `<div class="error">오류가 발생했습니다: ${error.message}</div>`;
    } finally {
        loading.classList.remove('active');
        if (btn) btn.disabled = false;
    }
}

function renderOrders(orders) {
    const orderList = document.getElementById('orderList');

    if (!orders || orders.length === 0) {
        orderList.innerHTML = '<div class="no-data">최근 24시간 내 변동된 주문 내역이 없습니다.</div>';
        return;
    }

    // 주문 번호 기준으로 그룹화
    const groups = {};
    orders.forEach(order => {
        const orderId = order.order_id || 'unknown';
        if (!groups[orderId]) {
            groups[orderId] = [];
        }
        groups[orderId].push(order);
    });

    let html = `
        <div class="table-responsive">
            <table class="order-table">
                <thead>
                    <tr>
                        <th style="width: 50px;"></th>
                        <th>주문일시</th>
                        <th>주문번호</th>
                        <th>상태</th>
                        <th>상품명 / 옵션</th>
                        <th>수량</th>
                        <th>구매자</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // 그룹별 렌더링
    Object.keys(groups).forEach(orderId => {
        const groupOrders = groups[orderId];
        const firstOrder = groupOrders[0]; // 대표 정보 (첫 번째 주문 기준)
        const rowId = `row-${orderId}`;
        const detailRowId = `detail-${orderId}`;
        const itemCount = groupOrders.length;

        // 날짜 포맷팅
        let dateStr = '-';
        if (firstOrder.order_date && firstOrder.order_date !== 'N/A') {
            try {
                dateStr = new Date(firstOrder.order_date).toLocaleString('ko-KR', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            } catch (e) {
                dateStr = firstOrder.order_date;
            }
        }

        // 상태 한글 변환 함수
        const getStatusText = (status) => {
            const statusMap = {
                'PAYED': '결제완료',
                'DISPATCHED': '발송중',
                'DELIVERING': '배송중',
                'DELIVERED': '배송완료',
                'PURCHASE_DECIDED': '구매확정',
                'EXCHANGED': '교환',
                'CANCELED': '취소',
                'RETURNED': '반품',
                'REFUNDED': '환불'
            };
            return statusMap[status] || status;
        };

        const getStatusClass = (status) => {
            if (status === 'PAYED') return 'status-payed';
            if (status === 'DISPATCHED' || status === 'DELIVERING') return 'status-dispatched';
            if (status === 'CANCELED' || status === 'RETURNED') return 'status-canceled';
            return 'status-default';
        };

        // 대표 상품명 생성 (예: "A상품 외 2건")
        let summaryProductName = firstOrder.product_name;
        if (itemCount > 1) {
            summaryProductName += ` 외 ${itemCount - 1}건`;
        }

        // 요약 행 (클릭 시 상세 펼침)
        html += `
            <tr class="order-group-header" onclick="toggleDetails('${orderId}')">
                <td class="toggle-icon" id="icon-${orderId}">▼</td>
                <td class="order-date">${dateStr}</td>
                <td class="order-id">${orderId}</td>
                <td><span class="status-badge ${getStatusClass(firstOrder.status)}">${getStatusText(firstOrder.status)}</span></td>
                <td class="product-info-cell">
                    <div class="order-product-name">${summaryProductName}</div>
                </td>
                <td class="order-quantity">${itemCount}종</td>
                <td class="buyer-name">${firstOrder.buyer_name}</td>
            </tr>
            <tr id="${detailRowId}" class="order-group-details" style="display: none;">
                <td colspan="7">
                    <div class="detail-container">
                        <table class="detail-table">
        `;

        // 상세 주문 내역 행들
        // 부모 테이블의 컬럼 구조: [Icon] [Date] [ID] [Status] [Product] [Qty] [Buyer]
        // 내부 테이블도 동일한 7개 컬럼을 유지해야 CSS table-layout: fixed가 제대로 동작함
        groupOrders.forEach(order => {
            html += `
                 <tr>
                    <td></td> <!-- Icon Column -->
                    <td></td> <!-- Date Column -->
                    <td></td> <!-- ID Column -->
                    <td><span class="status-badge ${getStatusClass(order.status)}">${getStatusText(order.status)}</span></td>
                    <td class="product-info-cell">
                        <div class="order-product-name">${order.product_name}</div>
                        <div class="order-option">${order.product_option || '-'}</div>
                    </td>
                    <td class="order-quantity">${order.quantity}개</td>
                    <td></td> <!-- Buyer Column -->
                 </tr>
             `;
        });

        html += `
                        </table>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    orderList.innerHTML = html;
}

function toggleDetails(orderId) {
    const detailRow = document.getElementById(`detail-${orderId}`);
    const icon = document.getElementById(`icon-${orderId}`);

    if (detailRow.style.display === 'none') {
        detailRow.style.display = 'table-row';
        icon.textContent = '▲';
    } else {
        detailRow.style.display = 'none';
        icon.textContent = '▼';
    }
}
