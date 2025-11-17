async function loadProducts() {
    const loadingEl = document.getElementById('loading');
    const gridEl = document.getElementById('productsGrid');
    
    loadingEl.classList.add('active');
    gridEl.innerHTML = '';
    
    try {
        const response = await fetch('/api/products');
        const data = await response.json();
        
        if (data.error) {
            gridEl.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }
        
        const products = data.products;
        
        // 상품 정렬: "풍선" 포함된 상품은 아래로
        products.sort((a, b) => {
            const aHasBalloon = a.name.includes('풍선');
            const bHasBalloon = b.name.includes('풍선');
            
            if (aHasBalloon && !bHasBalloon) return 1;
            if (!aHasBalloon && bHasBalloon) return -1;
            return 0;
        });
        
        // 상품 카드 생성
        products.forEach(product => {
            const card = createProductCard(product);
            gridEl.appendChild(card);
        });
        
    } catch (error) {
        gridEl.innerHTML = `<div class="error">오류가 발생했습니다: ${error.message}</div>`;
    } finally {
        loadingEl.classList.remove('active');
    }
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    let optionsHtml = '';
    
    if (product.options && product.options.length > 0) {
        optionsHtml = '<div class="options-title">📦 옵션별 재고</div>';
        product.options.forEach(option => {
            let stockClass = '';
            if (option.stock === 0) stockClass = 'zero';
            else if (option.stock < 10) stockClass = 'low';
            
            optionsHtml += `
                <div class="option-item">
                    <span class="option-name">${option.name}</span>
                    <span class="option-stock ${stockClass}">${option.stock.toLocaleString()}개</span>
                </div>
            `;
        });
    } else {
        optionsHtml = '<div class="no-options">옵션 정보 없음</div>';
    }
    
    card.innerHTML = `
        <div class="product-header">
            <div class="product-name">${product.name}</div>
            <div class="product-info">
                <span class="badge badge-sale">${product.status}</span>
                <span class="price">${product.price.toLocaleString()}원</span>
            </div>
        </div>
        
        <div class="total-stock">
            <div class="total-stock-label">전체 재고</div>
            <div class="total-stock-value">${product.total_stock.toLocaleString()}개</div>
        </div>
        
        ${optionsHtml}
    `;
    
    return card;
}

// 페이지 로드 시 자동 실행
window.addEventListener('load', loadProducts);
