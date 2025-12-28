
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

def sync_orders_to_sheet(new_orders, clear_sheet=False):
    """
    네이버에서 가져온 주문 데이터를 구글 시트에 동기화합니다.
    - clear_sheet=True: 기존 시트 내용을 모두 지우고 새로 씁니다.
    - 기존 주문 ID가 있으면 상태를 업데이트
    - 새로운 주문이면 추가
    **API 제한(60회/분)을 피하기 위해 배치 처리(Batch Processing)를 사용합니다.**
    """
    client = connect_to_sheets()
    if not client:
        return {"status": "error", "message": "Google Sheets 연결 실패"}

    worksheet = get_or_create_worksheet(client)
    if not worksheet:
        return {"status": "error", "message": "스프레드시트를 찾을 수 없습니다. 'SmartStore_Orders' 이름의 시트를 만들고 공유했는지 확인해주세요."}

    # [초기화 요청 처리]
    if clear_sheet:
        try:
            worksheet.clear()
            worksheet.append_row(["order_date", "product_order_id", "order_id", "product_name", "product_option", "quantity", "buyer_name", "status"])
        except Exception as e:
            return {"status": "error", "message": f"시트 초기화 실패: {str(e)}"}

    # 현재 시트 데이터 가져오기
    try:
        existing_records = worksheet.get_all_records()
    except:
        existing_records = []

    # 헤더가 없으면 생성 (A1 셀이 비었는지 확인)
    is_empty_header = True
    try:
        # A1 셀 값 확인 (비어있으면 None 또는 '')
        val = worksheet.acell('A1').value
        if val:
            is_empty_header = False
    except:
        pass

    if is_empty_header:
        headers = ["order_date", "product_order_id", "order_id", "product_name", "product_option", "quantity", "buyer_name", "status"]
        if not existing_records: # 레코드가 없으면 append_row
             worksheet.append_row(headers)
        else:
             # 레코드는 있는데 헤더가 없는 경우 (거의 없겠지만) insert_row
             worksheet.insert_row(headers, index=1)
        
        # 헤더 추가했으니 existing_records 다시 로드할 수도 있지만, 
        # sync 로직에서는 existing_records가 비어있을 때 주로 타므로 패스
        existing_records = []

    # Product Order ID 매핑 (ID -> Row Index)
    # 1-based index, 헤더가 1행이므로 첫 데이터는 2행부터 시작
    # existing_records는 0번 인덱스가 실제 시트의 2행
    id_to_row_map = {str(item.get('product_order_id')): i + 2 for i, item in enumerate(existing_records)}
    
    rows_to_append = []
    # 업데이트할 셀들: (Row, Col, Value) - gspread Cell 객체 리스트로 만듦
    cells_to_update = [] 
    
    added_count = 0
    updated_count = 0

    for order in new_orders:
        p_id = str(order.get('product_order_id'))
        current_status = order.get('status', '')
        
        if p_id in id_to_row_map:
            # [이미 존재함] -> 상태 업데이트 체크
            row_idx = id_to_row_map[p_id]
            # existing_records 데이터와 비교 (API 호출 아님)
            # existing_records[row_idx - 2] 가 해당 rec
            # 하지만 여기서 단순 비교를 위해 Cell 객체 생성 로직으로 바로 감
            
            # 기존 레코드에서 가져와 비교 (API read 줄이기)
            record = existing_records[row_idx - 2]
            if record.get('status') != current_status:
                # 상태 변경 필요 -> Batch Update 목록에 추가
                # 상태 컬럼은 8번째 (H)
                cells_to_update.append(gspread.Cell(row_idx, 8, current_status))
                updated_count += 1
        else:
            # [새 주문] -> Batch Append 목록에 추가
            row_data = [
                order.get('order_date', ''),
                p_id,
                order.get('order_id', ''),
                order.get('product_name', ''),
                order.get('product_option', ''),
                order.get('quantity', 0),
                order.get('buyer_name', ''),
                current_status
            ]
            rows_to_append.append(row_data)
            added_count += 1

    # 1. 일괄 추가 (Batch Append)
    if rows_to_append:
        try:
            worksheet.append_rows(rows_to_append)
        except Exception as e:
            print(f"Batch Append Error: {e}")

    # 2. 일괄 업데이트 (Batch Update)
    if cells_to_update:
        try:
            worksheet.update_cells(cells_to_update)
        except Exception as e:
            print(f"Batch Update Error: {e}")

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
