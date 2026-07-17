# techtalk 주제 분류 체계 (Taxonomy)

`대주제 > 중주제 > 소주제`. 소주제 목록은 **예시이자 시드**다. 고갈되면 같은 중주제 아래로 새 소주제를 합리적으로 추가해도 된다. 새 주제를 다룰 때마다 여기에 한 줄 추가해 트리를 키운다.

표기: `✅` = index.md에 생성 이력 있음(이미 다룸), `·` = 미커버.

> 지향점: **대규모 시스템 설계(쿠팡/네이버급)**. 이론 → 분산 → 데이터/메시징/캐시/검색 → 트래픽/운영 → 종합 설계 케이스로 이어지는 사다리.

---

## 대주제: 백엔드 (Backend — 대규모 시스템 설계 지향)

### 중주제: CS 기초 (Computer Science)
- · 프로세스 vs 스레드 vs 코루틴
- · 컨텍스트 스위칭 비용
- · 메모리 계층과 캐시 지역성
- · GC 알고리즘과 stop-the-world
- · 동시성: race condition, deadlock, livelock
- · 자료구조 선택과 시간/공간 복잡도 트레이드오프
- · 확률적 자료구조: 블룸 필터 (FP/FN 비대칭, m·n·k 사이징, Cuckoo/Counting/Scalable)
- · 직렬화 포맷 (JSON/Protobuf/Avro)

### 중주제: DB & 스토리지 (Databases & Storage)
- · 인덱스 내부 구조 (B-Tree vs LSM-Tree)
- · 트랜잭션 격리 수준과 이상 현상 (dirty/non-repeatable/phantom)
- · 낙관적 락 vs 비관적 락
- · MVCC와 vacuum
- · 정규화 vs 비정규화, 언제 깨뜨리나
- · 샤딩 전략 (range/hash/directory)과 리밸런싱
- · 읽기 복제본(Read Replica)과 복제 지연(lag)
- · 커넥션 풀 사이징과 고갈
- · N+1 문제와 해결 (batch/join/dataloader)
- · SQL vs NoSQL, polyglot persistence
- · 객체 스토리지 / 블롭 / 시계열 DB 선택
- · OLTP vs OLAP, 데이터 웨어하우스/레이크

### 중주제: 분산 시스템 (Distributed Systems)
- · CAP 정리와 PACELC
- · 일관성 모델 (strong / eventual / causal / read-your-writes)
- · 합의 알고리즘 (Raft, Paxos)
- · 쿼럼(quorum) 읽기/쓰기와 W+R>N
- · 리더 선출과 split-brain
- · 분산 락 (Redlock 논쟁 포함)
- · 시계와 순서 (Lamport clock, vector clock, TrueTime)
- · 분산 트랜잭션 (2PC) vs Saga
- · 멱등성과 "정확히 한 번(exactly-once)"의 환상
- · 합의 없는 복제와 충돌 해결 (CRDT, LWW)

### 중주제: 캐싱 (Caching)
- · 캐시 전략 (look-aside / write-through / write-behind / read-through)
- · 캐시 무효화와 일관성 (가장 어려운 문제)
- · 캐시 스탬피드(thundering herd) 방어 (TTL jitter, mutex, stale-while-revalidate)
- · Redis 자료구조와 활용 패턴
- · 분산 캐시와 일관성 해싱
- · 핫키(hot key) 문제와 로컬 캐시 조합
- · 캐시 계층화 (L1 로컬 / L2 분산 / CDN)

### 중주제: 메시징 & 스트리밍 (Messaging & Streaming)
- · 메시지 큐 vs 이벤트 스트림 (RabbitMQ vs Kafka)
- · Kafka 내부: 파티션·오프셋·세그먼트
- · Consumer group과 리밸런싱
- · 순서 보장과 파티셔닝 키 설계
- · at-least-once / at-most-once / exactly-once 시맨틱
- · DLQ(Dead Letter Queue)와 독성 메시지 처리
- · 백프레셔와 컨슈머 lag 관리
- · 이벤트 백필/재처리(replay)
- · 동기 통신 vs 이벤트 기반 통신

### 중주제: 검색 (Search)
- · 역색인(inverted index) 구조
- · Elasticsearch 샤드/레플리카 설계
- · 색인 파이프라인과 near-real-time 색인
- · 랭킹과 스코어링 (TF-IDF, BM25)
- · 자동완성(autocomplete)과 오타 보정
- · 검색과 원본 DB 동기화 (CDC)

### 중주제: 서버 & 런타임 (Server & Runtime)
- · 스레드 풀 vs 이벤트 루프 (블로킹 비용)
- · 동기 vs 비동기 vs 논블로킹 I/O
- · 백프레셔(backpressure)와 흐름 제어
- · 멱등성(idempotency) 보장 설계
- · graceful shutdown과 in-flight 요청 처리
- · 커넥션/리소스 누수와 풀 관리

### 중주제: API 설계 (API Design)
- · REST vs gRPC vs GraphQL 트레이드오프
- · 커서 vs 오프셋 페이지네이션
- · API 버저닝 전략
- · 멱등성 키와 안전한 재시도
- · 스키마 진화와 하위 호환 (backward/forward compat)
- · BFF와 클라이언트별 API

### 중주제: Network (네트워크)
- · TCP 3-way handshake와 connection 비용
- · HTTP/1.1 vs HTTP/2 vs HTTP/3(QUIC)
- · TLS 핸드셰이크와 termination 위치
- · 타임아웃/리트라이/서킷브레이커 조합
- · keep-alive와 connection reuse
- · DNS 동작과 캐싱 함정
- · 멱등 리트라이와 재전송 폭풍(retry storm)
- · 로드밸런서 L4 vs L7

### 중주제: Architecture (아키텍처)
- · MSA 어드민/백오피스: API Aggregation vs Copied DB (CDC/Event)
- · 모놀리식 vs MSA, 분리 기준
- · 서비스 경계(bounded context)를 어디서 자르나
- · CQRS와 read model 분리
- · 이벤트 소싱 (event sourcing)
- · Saga 패턴과 보상 트랜잭션
- · Outbox 패턴과 이벤트 누락 방지
- · API Gateway / BFF 패턴
- · 멀티테넌시 설계

### 중주제: Traffic & 확장성 (Traffic & Scalability)
- · 수직 확장 vs 수평 확장
- · 레이트 리미팅 알고리즘 (token bucket/leaky bucket/sliding window)
- · 부하 분산 알고리즘 (round-robin/least-conn/consistent hashing)
- · 핫키(hot key)와 셀러브리티 문제
- · 대량 트래픽 이벤트(특가/티켓팅) 대비 설계
- · 큐를 통한 부하 평탄화(load leveling)
- · CDN과 엣지 캐싱
- · 자동 확장(auto-scaling)과 예열(warm-up)

### 중주제: Infra & 배포 (Infra & Deploy)
- · 컨테이너 vs VM, 격리 수준
- · 오케스트레이션(K8s) 스케줄링과 리소스 request/limit
- · 무중단 배포 (blue-green/canary/rolling)
- · 헬스체크 (liveness vs readiness)
- · IaC와 불변 인프라
- · 시크릿 관리와 로테이션
- · 멀티리전/멀티AZ 구성

### 중주제: 운영 & 신뢰성 (Operations & Reliability / SRE)
- · 관측성 3축: 로그/메트릭/트레이싱
- · SLI/SLO/SLA와 에러 버짓
- · 알림 피로(alert fatigue)와 좋은 알림 설계
- · 장애 대응(incident)과 포스트모템
- · 부하 격리(bulkhead)와 장애 전파 차단
- · 서킷브레이커·재시도·타임아웃 회복탄력성 조합
- · 카오스 엔지니어링
- · 데이터 마이그레이션 무중단 전략 (expand-contract)
- · 배치 작업이 대고객 런타임에 주는 영향 격리

### 중주제: 시스템 디자인 케이스 (System Design Practice)
> 위 중주제들을 종합해 "실제 서비스 한 개"를 설계하는 연습. 면접·실무 직결.
- · URL 단축기 (key 생성·리다이렉트·확장)
- · 뉴스피드 / 타임라인 (fan-out on write vs read)
- · 알림 시스템 (푸시/이메일/SMS, 대량 발송)
- · 실시간 채팅 / 메시징
- · 분산 레이트 리미터
- · 주문/재고 시스템 (동시성·오버셀 방지) — 쿠팡형
- · 결제/정산 시스템 (정합성·멱등성)
- · 검색 자동완성 (네이버형)
- · 상품 추천/피드 랭킹
- · 배달/배차 매칭 (지리 공간 인덱싱)
- · 좋아요/조회수 카운터 (대규모 카운팅)
- · 분산 ID 생성기 (Snowflake)

---

## (확장 예정) 다른 대주제
필요 시 아래를 대주제로 승격해 트리를 넓힌다.
- 데이터·ML 엔지니어링 / 보안 / 결제·정산 도메인 심화 / 프론트엔드·모바일
