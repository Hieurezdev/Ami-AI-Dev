
"use client";

import { useAtom } from "jotai";
import React, { useEffect, useState, useRef } from "react";
import { isLoadingAtom, lastMessageAtom } from "~/atoms/ChatAtom";
import Spinner from "./Spinner";

export default function ChatterBox() {
  const [message] = useAtom(lastMessageAtom);
  const [isLoading] = useAtom(isLoadingAtom);
  const [key, setKey] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isHiding, setIsHiding] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setKey(prevKey => prevKey + 1);
    
    // Reset visibility khi có tin nhắn mới
    if (message)  {
      setIsVisible(true);
      setIsHiding(false);
      
      // Clear timeout cũ nếu có
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Đặt timeout để ẩn tin nhắn sau 15 giây
      timeoutRef.current = setTimeout(() => {
        setIsHiding(true);
        // Sau khi animation fade out hoàn thành, ẩn hoàn toàn
        setTimeout(() => {
          setIsVisible(false);
        }, 500); // 500ms cho animation fade out
      }, 15000); // 15 giây
    }
  }, [message]);

  // Cleanup timeout khi component unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if ((!message && !isLoading) || !isVisible) {
    return null;
  }

  return (
    <div className="absolute top-7 flex flex-col-reverse items-center z-40">
      {isLoading ? (
        <Spinner />
      ) : (
        <div
          key={key}
          className={`flex max-w-3xl justify-center border-[3px] rounded-[14px] bg-white p-4 shadow transition-all duration-500 ${
            isHiding ? 'animate-message-fade-out' : 'animate-message-appear'
          }`}
        >
          <span className="overflow-hidden text-center font-medium">
            {message?.content as string}
          </span>
        </div>
      )}
      <style jsx>{`
        @keyframes messageAppear {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes messageFadeOut {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.95);
          }
        }

        .animate-message-appear {
          animation: messageAppear 0.3s ease-out forwards;
        }
        
        .animate-message-fade-out {
          animation: messageFadeOut 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}