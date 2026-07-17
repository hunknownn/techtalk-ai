"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 어시스턴트 메시지용 마크다운 렌더러.
 * 스트리밍 중 매 청크마다 re-render되므로 memo로 동일 텍스트 재파싱을 막는다.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 산출물 링크 등 외부 링크는 새 탭으로
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
