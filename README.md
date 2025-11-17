# 네이버 스마트스토어 재고 관리 시스템

네이버 커머스 API를 활용한 실시간 재고 관리 웹 애플리케이션

## 주요 기능

- 📊 실시간 상품 재고 현황 조회
- 📦 옵션별 상세 재고 확인
- 🔄 자동 새로고침 기능
- 📱 반응형 웹 디자인 (모바일 지원)
- ⚠️ 재고 부족 알림

## 기술 스택

- Python 3.x
- Flask
- Naver Commerce API v2
- HTML/CSS/JavaScript

## 환경 변수 설정

`.env` 파일에 다음 정보 입력:

```
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
```

## 로컬 실행

```bash
pip install -r requirements.txt
python app.py
```

## 배포

Render.com에서 자동 배포 가능
