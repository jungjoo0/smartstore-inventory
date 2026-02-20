import time
import requests
import json
import bcrypt
import pybase64
import os
from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user

# Flask 앱 초기화
app = Flask(__name__)

# 세션 관리를 위한 시크릿 키 설정 (환경 변수 권장, 기본값 제공)
app.secret_key = os.environ.get('SECRET_KEY', 'default-dev-secret-key')

# Flask-Login 설정
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# 사용자 모델 (간단히 구현)
class User(UserMixin):
    def __init__(self, id):
        self.id = id

# 사용자 로더
@login_manager.user_loader
def load_user(user_id):
    if user_id == 'fablely':
        return User(user_id)
    return None

# Naver Commerce API 인증 토큰 발급을 시도하는 함수입니다.
def token():
    # .env 파일에서 환경 변수를 불러옵니다.
    client_id = os.environ.get('NAVER_CLIENT_ID')
    client_secret = os.environ.get('NAVER_CLIENT_SECRET')
    
    if not client_id or not client_secret:
        print("★ 오류: NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경 변수가 설정되지 않았습니다. ★")
        print("`.env` 파일을 확인하거나, 환경 변수가 올바르게 설정되었는지 확인해주세요.")
        return 0
    
    # 1. 서명에 사용할 타임스탬프 (현재 시간보다 10초 이전)를 생성합니다. (밀리초 단위)
    timestamp = str(int((time.time() - 10) * 1000))
    
    # 2. 서명에 사용할 문자열 (client_id + "_" + timestamp)을 생성합니다.
    pwd = f'{client_id}_{timestamp}'
    
    # 3. bcrypt를 사용하여 서명 문자열을 클라이언트 시크릿으로 해싱합니다.
    try:
        hashed = bcrypt.hashpw(pwd.encode('utf-8'), client_secret.encode('utf-8'))
        # 4. 해싱된 결과를 Base64로 인코딩합니다.
        client_secret_sign = pybase64.standard_b64encode(hashed).decode('utf-8')
    except Exception as e:
        print(f"오류: 해싱 중 문제가 발생했습니다. client_id와 client_secret이 올바른지 확인하세요: {e}")
        return 0

    # 5. 토큰 발급 API를 호출합니다.
    url = "https://api.commerce.naver.com/external/v1/oauth2/token"
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'timestamp': timestamp,
        'client_secret_sign': client_secret_sign,
        'type': 'SELF'
    }
        
    try:
        response = requests.post(url, headers=headers, data=data)
        response.raise_for_status() # HTTP 오류가 발생하면 예외를 발생시킵니다.
        
        response_json = response.json()
        
        # 6. 응답에서 access_token이 있는지 확인하여 반환합니다.
        if 'access_token' in response_json:
            print("--- 토큰 발급 성공 ---")
            print(f"Access Token: {response_json['access_token']}")
            return response_json['access_token']
        else:
            print("--- 토큰 발급 실패 ---")
            print("API 응답에 access_token이 없습니다.")
            print(f"전체 응답: {response_json}")
            return 0
            
    except requests.exceptions.HTTPError as errh:
        print(f"HTTP 오류 발생: {errh}")
        # 오류 발생 시 응답 본문을 출력하여 상세 내용을 확인합니다.
        if 'response' in locals() and response is not None:
             print(f"응답 본문: {response.text}")
        return 0
    except requests.exceptions.RequestException as err:
        print(f"토큰 발급 중 알 수 없는 오류 발생: {err}")
        return 0

# --- ★ (MODIFIED) 상품 상세 조회 API 호출 함수 ★ ---
# 각 상품의 상세 정보(옵션 포함)를 가져오기 위한 별도 함수입니다.
def get_product_detail(access_token, origin_product_no):
    """
    원본 상품 번호(originProductNo)를 사용하여 원본 상품 조회 API를 호출하고,
    상세 옵션별 재고를 반환합니다.
    """
    if not origin_product_no:
        return None

    # --- ★ 원본 상품 조회 API 엔드포인트 (v2) ★ ---
    url = f"https://api.commerce.naver.com/external/v2/products/origin-products/{origin_product_no}"
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        detail_data = response.json()

        # --- ★ 옵션 파싱 로직 (상세 API 응답 기반) ★ ---
        
        options_data = None
        options_type = None
        
        origin_product = detail_data.get('originProduct')
        
        if not origin_product:
             origin_product = detail_data

        # 1. (Combinations) 'optionCombinations' 경로 탐색
        detail_attribute = origin_product.get('detailAttribute')
        if detail_attribute and isinstance(detail_attribute, dict):
            option_info = detail_attribute.get('optionInfo')
            if option_info and isinstance(option_info, dict):
                options_data = option_info.get('optionCombinations')
                if options_data:
                    options_type = 'Combinations'

        # 2. (List) 1번 실패 시 'productOptionList' 탐색
        if not options_data:
            options_data = origin_product.get('productOptionList')
            if options_data:
                options_type = 'List'
        
        # 3. (List) 2번 실패 시 'options' 탐색
        if not options_data:
            options_data = origin_product.get('options')
            if options_data:
                options_type = 'List'

        # --- 옵션 데이터 처리 ---
        result_options = []
        
        if options_data and isinstance(options_data, list) and len(options_data) > 0:
            for option in options_data:
                option_names = []
                
                if options_type == 'Combinations':
                    for name_key in ['optionName1', 'optionName2', 'optionName3', 'optionName4']:
                        option_value = option.get(name_key)
                        if option_value:
                            option_names.append(option_value)
                
                elif options_type == 'List':
                    for name_key in ['name', 'optionName', 'name1', 'name2', 'name3']:
                        option_value = option.get(name_key)
                        if option_value and option_value not in option_names:
                            option_names.append(option_value)
                
                option_detail = ' / '.join(option_names) if option_names else '옵션 정보 없음'
                option_stock = option.get('stockQuantity', 0)
                
                result_options.append({
                    'name': option_detail,
                    'stock': option_stock
                })
        
        return result_options if result_options else None

    except Exception as e:
        return None


# 발급받은 토큰을 사용하여 상품 목록을 조회하는 함수입니다.
def get_product_list(access_token):
    if not access_token:
        return []

    # 상품 검색 API URL (POST /products/search 엔드포인트)
    url = "https://api.commerce.naver.com/external/v1/products/search"
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    # POST 요청에 필요한 JSON Payload
    payload = {
        "productStatusTypes": ["SALE"],
        "page": 1,
        "size": 50
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        
        product_data = response.json()
        product_groups = product_data.get('contents', [])
        
        all_products = []
        for group in product_groups:
            all_products.extend(group.get('channelProducts', []))

        # 상품 정보 가공
        products_info = []
        for product in all_products:
            product_info = {
                'name': product.get('name', 'N/A'),
                'status': product.get('statusType', 'N/A'),
                'price': product.get('salePrice', 0),
                'total_stock': product.get('stockQuantity', 0),
                'origin_product_no': product.get('originProductNo'),
                'options': []
            }
            
            # 상품 상세 조회로 옵션 정보 가져오기
            if product_info['origin_product_no']:
                options = get_product_detail(access_token, product_info['origin_product_no'])
                if options:
                    product_info['options'] = options
            
            products_info.append(product_info)
        
        return products_info

    except Exception as e:
        print(f"상품 조회 오류: {e}")
        return []


# 주문 내역을 조회하는 함수입니다. (최근 24시간 변동 내역)
def get_order_list(access_token, days=1, offset=0):
    """
    네이버 API를 통해 변동된 주문 내역을 가져옵니다.
    offset일 전부터 days일 동안의 데이터를 조회합니다.
    (예: days=1, offset=0 -> 최근 24시간)
    (예: days=1, offset=1 -> 24시간 전 ~ 48시간 전)
    """
    url = "https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    import datetime
    KST = datetime.timezone(datetime.timedelta(hours=9))
    now = datetime.datetime.now(KST)
    
    all_orders = []
    
    # offset부터 offset+days까지 루프
    # i=0 (offset=0): now - 0일 전 ~ now - 1일 전
    start_idx = offset
    end_idx = offset + days
    
    for i in range(start_idx, end_idx):
        end_time = now - datetime.timedelta(days=i)
        start_time = end_time - datetime.timedelta(days=1)
        
        last_changed_from = start_time.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + '+09:00'
        
        # 1. 변경된 주문 ID 조회
        lc_url = f"{url}/last-changed-statuses"
        lc_params = {'lastChangedFrom': last_changed_from}
        
        try:
            lc_resp = requests.get(lc_url, headers=headers, params=lc_params)
            if lc_resp.status_code != 200:
                continue
                
            lc_data = lc_resp.json()
            product_order_ids = [
                stat['productOrderId'] 
                for stat in lc_data.get('data', {}).get('lastChangeStatuses', [])
            ]
            
            if not product_order_ids:
                continue
                
            # 2. 상세 내역 조회
            chunk_size = 300
            for k in range(0, len(product_order_ids), chunk_size):
                chunk_ids = product_order_ids[k:k+chunk_size]
                q_resp = requests.post(f"{url}/query", headers=headers, json={'productOrderIds': chunk_ids})
                
                if q_resp.status_code == 200:
                    q_data = q_resp.json()
                    all_orders.extend(q_data.get('data', []))
                    
        except Exception as e:
            print(f"Naver API Error (Day {i}): {e}")
            continue

    # 데이터 가공 및 중복 제거
    orders_info = []
    processed_ids = set()
    
    for item in all_orders:
        product_order = item.get('productOrder', {})
        p_id = product_order.get('productOrderId')
        
        if not p_id or p_id in processed_ids:
            continue
        processed_ids.add(p_id)
        
        status = product_order.get('productOrderStatus')
            
        order_detail = item.get('order', {})
        shipping_address = product_order.get('shippingAddress', {})
        
        buyer_name = shipping_address.get('name') or order_detail.get('ordererName', 'N/A')
        order_date = order_detail.get('orderDate') or product_order.get('placeOrderDate')
        
        orders_info.append({
            'order_date':  order_date if order_date else 'N/A',
            'product_order_id': str(p_id),
            'order_id': order_detail.get('orderId', 'N/A'),
            'product_name': product_order.get('productName'),
            'product_option': product_order.get('productOption'),
            'quantity': product_order.get('quantity'),
            'buyer_name': buyer_name,
            'status': status,
        })
        
    # 최신순 정렬
    orders_info.sort(key=lambda x: x['order_date'], reverse=True)
    return orders_info







# Flask 라우트

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        # 환경 변수에서 설정된 비밀번호 가져오기 (기본값: 'admin')
        admin_password = os.environ.get('ADMIN_PASSWORD', 'admin')
        
        if username == 'fablely' and password == admin_password:
            user = User(username)
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('아이디 또는 비밀번호가 올바르지 않습니다.', 'error')
            
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    """메인 페이지 (재고 관리)"""
    return render_template('index.html')


@app.route('/orders')
@login_required
def orders():
    """주문 내역 페이지"""
    return render_template('orders.html')


@app.route('/api/server-ip')
@login_required
def get_server_ip():
    """현재 서버의 외부 IP 주소 조회"""
    try:
        response = requests.get('https://api.ipify.org?format=json', timeout=5)
        ip_data = response.json()
        return jsonify({
            'server_ip': ip_data.get('ip'),
            'message': '이 IP를 네이버 커머스 API 설정에 추가하세요'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/products')
@login_required
def api_products():
    """상품 목록 API"""
    load_dotenv()
    access_token = token()
    
    if not access_token:
        # 401 Unauthorized 대신 500으로 처리하거나, 클라이언트가 로그인 페이지로 리다이렉트 되도록 처리할 수 있음
        # 여기서는 API 요청이므로 JSON 에러 반환
        return jsonify({'error': '토큰 발급 실패'}), 500
    
    products = get_product_list(access_token)
    return jsonify({'products': products})



# 메모리 캐시 설정 (전역 변수)
# 5분(300초) 단위로 최근 주문을 캐싱하여 API 호출 제한 방지
ORDER_CACHE = {
    'data': [],
    'last_updated': 0
}
CACHE_DURATION_SECONDS = 300

@app.route('/api/orders')
@login_required
def api_orders():
    """
    주문 내역을 JSON으로 반환합니다.
    - 기본: 구글 시트에서 데이터 조회 (고속, 무제한)
    - sync=true 파라미터: 네이버 API에서 최근 데이터 가져와 시트 동기화
    """
    load_dotenv()
    access_token = token()
    
    if not access_token:
        return jsonify({'error': '네이버 커머스 API 토큰 발급 실패. 잠시 후 다시 시도해주세요.'}), 500

    sync_requested = request.args.get('sync') == 'true'
    current_time = time.time()
    
    # 1. 강제 동기화 요청이거나, 캐시 만료, 혹은 데이터가 없는 경우 API 재호출
    if sync_requested or (current_time - ORDER_CACHE['last_updated'] > CACHE_DURATION_SECONDS) or not ORDER_CACHE['data']:
        try:
            # 최근 3일 치 주문 가져오기 (필요 시 일수 조정)
            days = int(request.args.get('days', 3))
            offset = int(request.args.get('offset', 0))
            
            naver_orders = get_order_list(access_token, days=days, offset=offset)
            
            # API에서 가져온 데이터를 캐시에 병합(누적/상태업데이트) 저장
            if naver_orders is not None:
                if offset == 0 and sync_requested:
                    # '새로고침(90일)' 버튼으로 첫 청크(0~15일) 요청 시에만 캐시 완전 초기화 후 새로 구축
                    ORDER_CACHE['data'] = naver_orders
                else:
                    # 나머지 (3일치 자동 업데이트, 15~90일치 추가 청크)는 기존 캐시에 병합
                    existing_map = {str(o.get('product_order_id')): i for i, o in enumerate(ORDER_CACHE['data'])}
                    for order in naver_orders:
                        p_id = str(order.get('product_order_id'))
                        if p_id in existing_map:
                            # 기존에 있는 주문이면 상태 등이 바뀌었을 수 있으므로 최신 데이터로 덮어씌움
                            ORDER_CACHE['data'][existing_map[p_id]] = order
                        else:
                            ORDER_CACHE['data'].append(order)
                    
                # 다시 날짜순(최신순) 정렬 보장
                ORDER_CACHE['data'].sort(key=lambda x: x['order_date'], reverse=True)
                ORDER_CACHE['last_updated'] = current_time
                
            msg = f"네이버 API에서 데이터를 동기화했습니다. ({days}일치, offset: {offset})" if sync_requested else "주문 데이터를 최신 상태로 캐싱했습니다."
            return jsonify({
                'orders': ORDER_CACHE['data'], # 어떤 요청이든 항상 누적된 전체 풀 데이터를 반환
                'message': msg
            })
            
        except Exception as e:
            # 예외 발생 시 에러 반환 (기존 캐시가 있다면 함께 보여주기 위함)
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f"데이터 동기화 실패: {str(e)}", 
                'orders': ORDER_CACHE['data']
            }), 500
    else:
        # 2. 유효한 캐시가 있는 경우 그대로 반환 (가장 빠른 응답)
        return jsonify({
            'orders': ORDER_CACHE['data'],
            'message': '서버 메모리(캐시)에 저장된 최근 주문 내역입니다.'
        })


# 메인 실행 블록
if __name__ == '__main__':
    load_dotenv()
    
    # Flask 웹 서버 실행
    port = int(os.environ.get('PORT', 5000))
    print("=" * 80)
    print("네이버 스마트스토어 재고 관리 웹 애플리케이션을 시작합니다.")
    print(f"웹 브라우저에서 http://localhost:{port} 을 열어주세요.")
    print("=" * 80)
    
    app.run(debug=False, host='0.0.0.0', port=port)