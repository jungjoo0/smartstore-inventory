document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
});

async function loadOrders() {
    const loading = document.getElementById('loading');
    const orderList = document.getElementById('orderList');
    const btn = document.querySelector('.btn');

    // 로딩 상태 표시
    loading.classList.add('active');
    btn.disabled = true;
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
        btn.disabled = false;
    }
}

function renderOrders(orders) {
    const orderList = document.getElementById('orderList');

    if (!orders || orders.length === 0) {
        orderList.innerHTML = '<div class="no-data">최근 24시간 내 변동된 주문 내역이 없습니다.</div>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="order-table">
                <thead>
                    <tr>
                        <th>주문일시</th>
                        <th>상태</th>
                        <th>상품명 / 옵션</th>
                        <th>수량</th>
                        <th>구매자</th>
                    </tr>
                </thead>
                <tbody>
    `;

    orders.forEach(order => {
        // 날짜 포맷팅
        let dateStr = '-';
        if (order.order_date && order.order_date !== 'N/A') {
            try {
                dateStr = new Date(order.order_date).toLocaleString('ko-KR', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            } catch (e) {
                dateStr = order.order_date;
            }
        }

        // 상태 한글 변환
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
        const statusText = statusMap[order.status] || order.status;

        // 상태에 따른 클래스
        let statusClass = 'status-default';
        if (order.status === 'PAYED') statusClass = 'status-payed';
        else if (order.status === 'DISPATCHED' || order.status === 'DELIVERING') statusClass = 'status-dispatched';
        else if (order.status === 'CANCELED' || order.status === 'RETURNED') statusClass = 'status-canceled';

        html += `
            <tr>
                <td class="order-date">${dateStr}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="product-info-cell">
                    <div class="order-product-name">${order.product_name}</div>
                    <div class="order-option">${order.product_option || '-'}</div>
                </td>
                <td class="order-quantity">${order.quantity}개</td>
                <td class="buyer-name">${order.buyer_name}</td>
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
