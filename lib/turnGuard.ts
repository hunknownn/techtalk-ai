/**
 * 가짜 턴 차단 — 모델이 대화를 혼자 이어쓰는 오염을 스트리밍 중에 잘라낸다.
 *
 * 배경: 하네스가 프롬프트에 끼워넣는 <system-reminder> 블록의 닫는 태그가
 * </parameter> 로 깨져 있다(하네스 쪽 버그, 앱에서 못 고침). 블록이 닫히지 않으면
 * 턴 경계가 "구조"에서 "평문"으로 강등되고, 모델이 자기 응답 뒤에 다음 턴들을
 * 통째로 지어낸다:
 *
 *   **질문:** CPU는 왜 64바이트를 통째로 끌어올까요?
 *   useruser1: 지역성 때문에, 함께 있는 데이터는...      ← 사용자 답변 창작
 *   system<system-reminder>...</parameter>               ← 시스템 턴 창작
 *
 * 화면 노출을 막는 것보다 중요한 건 DB·SDK 세션에 저장되지 않게 하는 것이다.
 * 한 번 저장되면 다음 턴 resume 때 모델이 자기 출력을 예시로 다시 보고,
 * "응답 안에 user 턴이 들어있는 것"이 그 대화의 정상 포맷으로 굳는다(래칫).
 */

/** 줄머리 턴 라벨. "useruser1:", "system<...", "assistant:" 등. 들여쓰기는 허용 안 함 */
const TURN_MARKER = /^(?:user|assistant|human|system)[\w.-]*\s*[:<]/i;

/** 리마인더 블록은 모델 출력에 나타날 이유가 없다 */
const REMINDER = /<system-reminder/i;

/** 이보다 길어지면 마커 후보에서 확정 탈락 */
const MAX_MARKER_LEN = 24;

/** 아직 마커가 될 가능성이 있는 문자 집합. 한글·기호가 오면 즉시 탈락해 스트리밍이 안 밀린다 */
const MARKER_CHARS = /^[<\w.\- ]*$/;

export interface TurnGuard {
  /** 델타를 넣고 내보내도 안전한 텍스트를 받는다. 잘라낸 뒤로는 항상 "" */
  push(chunk: string): string;
  /** 스트림 종료 시 보류분 회수 */
  flush(): string;
  /** 가짜 턴을 감지해 잘라냈는가 */
  readonly truncated: boolean;
}

function isFakeTurn(line: string): boolean {
  return TURN_MARKER.test(line) || REMINDER.test(line);
}

export function createTurnGuard(): TurnGuard {
  /** 현재 줄에서 아직 마커 판정이 안 끝난 앞부분 */
  let held = "";
  /** 현재 줄에서 이미 내보낸 부분. 코드펜스 판정은 조각이 아니라 줄 전체로 해야 한다 */
  let lineSoFar = "";
  /** 현재 줄이 마커 후보에서 탈락했는가(= 이미 일부를 내보냈는가) */
  let lineFree = false;
  /** ``` 코드펜스 안인가. 설정 예시의 `user:` 같은 오탐을 피한다 */
  let inFence = false;
  let cut = false;

  const guard = {
    get truncated() {
      return cut;
    },

    push(chunk: string): string {
      if (cut) return "";
      held += chunk;
      let out = "";

      for (;;) {
        const nl = held.indexOf("\n");

        if (nl >= 0) {
          const line = held.slice(0, nl);
          // lineFree면 이 조각은 줄 중간부터라 줄머리 판정 대상이 아니다
          if (!lineFree && !inFence && isFakeTurn(line)) {
            cut = true;
            return out;
          }
          if ((lineSoFar + line).trimStart().startsWith("```")) inFence = !inFence;
          out += line + "\n";
          held = held.slice(nl + 1);
          lineSoFar = "";
          lineFree = false;
          continue;
        }

        // 줄이 아직 안 끝났다
        if (lineFree) {
          out += held;
          lineSoFar += held;
          held = "";
        } else if (!inFence && REMINDER.test(held)) {
          cut = true;
          return out;
        } else if (held.length >= MAX_MARKER_LEN || !MARKER_CHARS.test(held)) {
          // 더는 마커가 될 수 없다 — 지금 판정하고 이 줄은 자유롭게 흘린다
          if (!inFence && TURN_MARKER.test(held)) {
            cut = true;
            return out;
          }
          lineFree = true;
          out += held;
          lineSoFar += held;
          held = "";
        }
        break;
      }

      return out;
    },

    flush(): string {
      if (cut || !held) return "";
      if (!lineFree && !inFence && isFakeTurn(held)) {
        cut = true;
        return "";
      }
      const rest = held;
      held = "";
      return rest;
    },
  };

  return guard;
}
