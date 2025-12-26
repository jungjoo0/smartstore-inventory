
import os
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import json

# 스코프 설정
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive"
]

def connect_to_sheets():
    """
    서비스 계정을 사용하여 구글 시트에 연결합니다.
    """
    json_key_path = 'service_account.json'
    
    if not os.path.exists(json_key_path):
        print(f"Error: {json_key_path} not found.")
        return None

    try:
        creds = ServiceAccountCredentials.from_json_keyfile_name(json_key_path, SCOPES)
        client = gspread.authorize(creds)
        return client
    except Exception as e:
        print(f"Connection Error: {e}")
        return None

def get_or_create_worksheet(client, spreadsheet_name="SmartStore_Orders"):
    """
    스프레드시트를 열거나 없으면 생성합니다.
    """
    try:
        # 스프레드시트 열기 (공유된 문서 이름으로 찾기)
        sheet = client.open(spreadsheet_name)
        worksheet = sheet.sheet1
        return worksheet
    except gspread.SpreadsheetNotFound:
        print(f"Spreadsheet '{spreadsheet_name}' not found.")
        # 자동 생성은 권한 문제로 실패할 수 있으므로, 사용자가 미리 만들어두는 것을 권장
        return None
    except Exception as e:
        print(f"Worksheet Error: {e}")
        return None

def sync_orders_to_sheet(new_orders):
    """
    네이버에서 가져온 주문 데이터를 구글 시트에 동기화합니다.
    - 기존 주문 ID가 있으면 상태를 업데이트
    - 새로운 주문이면 추가
    """
    client = connect_to_sheets()
    if not client:
        return {"status": "error", "message": "Google Sheets 연결 실패"}

    worksheet = get_or_create_worksheet(client)
    if not worksheet:
        return {"status": "error", "message": "스프레드시트를 찾을 수 없습니다. 'SmartStore_Orders' 이름의 시트를 만들고 공유했는지 확인해주세요."}

    # 현재 시트 데이터 가져오기 (헤더 제외)
    try:
        existing_records = worksheet.get_all_records()
    except:
        # 헤더가 없거나 비어있는 경우
        existing_records = []

    # 헤더가 없으면 생성
    if not existing_records and worksheet.row_count == 0:
        headers = ["order_date", "product_order_id", "order_id", "product_name", "product_option", "quantity", "buyer_name", "status"]
        worksheet.append_row(headers)
        existing_records = []

    # Product Order ID를 키로 하는 딕셔너리 생성 (빠른 검색용)
    existing_map = {str(item.get('product_order_id')): i + 2 for i, item in enumerate(existing_records)}
    # i+2 이유: 1-based index + Header row(1)

    added_count = 0
    updated_count = 0

    # 최신순 정렬 (오래된 것부터 쌓기 위해 역순으로 처리할 수도 있지만, 여기선 그냥 진행)
    # 네이버 데이터는 최신순으로 옴.
    
    for order in new_orders:
        p_id = str(order.get('product_order_id'))
        
        # 데이터 포맷팅
        row_data = [
            order.get('order_date', ''),
            p_id,
            order.get('order_id', ''),
            order.get('product_name', ''),
            order.get('product_option', ''),
            order.get('quantity', 0),
            order.get('buyer_name', ''),
            order.get('status', '')
        ]

        if p_id in existing_map:
            # 이미 존재하는 주문 -> 상태 업데이트 확인
            row_idx = existing_map[p_id]
            # 상태 컬럼은 8번째 (H)
            # 기존 상태와 비교 (API 호출 줄이기 위해)
            # gspread는 셀 단위 업데이트 비용이 비싸므로, 
            # 배치 처리가 좋지만 간단하게 구현.
            # 여기서는 편의상 상태만 업데이트
            current_status = worksheet.cell(row_idx, 8).value
            if current_status != order.get('status'):
                worksheet.update_cell(row_idx, 8, order.get('status'))
                updated_count += 1
        else:
            # 새로운 주문 -> 추가
            worksheet.append_row(row_data)
            added_count += 1

    return {"status": "success", "added": added_count, "updated": updated_count}

def get_orders_from_sheet():
    """
    구글 시트의 모든 주문 내역을 가져옵니다.
    """
    client = connect_to_sheets()
    if not client:
        return []

    worksheet = get_or_create_worksheet(client)
    if not worksheet:
        return []

    try:
        records = worksheet.get_all_records()
        # 최신 날짜순 정렬
        records.sort(key=lambda x: x.get('order_date', ''), reverse=True)
        return records
    except Exception as e:
        print(f"Read Error: {e}")
        return []
