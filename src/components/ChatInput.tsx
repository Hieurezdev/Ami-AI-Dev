"use client";

import type { CoreMessage } from "~/types/chat";
import { useAtom } from "jotai";
import { useEffect, useRef, useState, useCallback, useDeferredValue } from "react";
import { IoSend } from "react-icons/io5";
import { FaMicrophone, FaMicrophoneSlash, FaSpinner } from "react-icons/fa";
import { isLoadingAtom, lastMessageAtom, messageHistoryAtom } from "~/atoms/ChatAtom";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default function ChatInput() {
  const [messages, setMessages] = useAtom(messageHistoryAtom);
  const [lastMessage, setLastMessage] = useAtom(lastMessageAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [input, setInput] = useState("");
  const deferredInput = useDeferredValue(input);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isAudioContextReady, setIsAudioContextReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Setup MediaRecorder for audio recording
  const setupRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        
        await convertSpeechToText(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

    } catch (error) {
      console.error('Error setting up recording:', error);
      alert('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập.');
    }
  }, []);

  const convertSpeechToText = useCallback(async (audioBlob: Blob) => {
    setIsProcessingAudio(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success && result.text) {
        setInput(prev => prev + ' ' + result.text);
        inputRef.current?.focus();
      } else {
        console.error('Speech-to-text failed:', result.error);
        alert('Không thể chuyển đổi giọng nói thành văn bản. Vui lòng thử lại.');
      }
    } catch (error) {
      console.error('Error converting speech to text:', error);
      alert('Lỗi khi chuyển đổi giọng nói thành văn bản.');
    } finally {
      setIsProcessingAudio(false);
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      await setupRecording();
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.start();
        setIsRecording(true);
        inputRef.current?.focus();
      }
    }
  }, [isRecording, setupRecording]);

  useEffect(() => {
    const handleUserGesture = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      setIsAudioContextReady(true);
    };

    ['click', 'touchstart'].forEach(event => document.addEventListener(event, handleUserGesture));

    return () => {
      ['click', 'touchstart'].forEach(event => document.removeEventListener(event, handleUserGesture));
      audioContextRef.current?.close();
      sourceNodeRef.current?.stop();
      sourceNodeRef.current?.disconnect();
      audioQueueRef.current = [];
      isPlayingRef.current = false;
    };
  }, []);

  const synthesizeSentence = useCallback(async (sentence: string): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch("/api/synthasize", {
        method: "POST",
        body: JSON.stringify({ message: { content: sentence, role: "assistant" } }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Failed to synthesize: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      return await audioContextRef.current!.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("synthesizeSentence error:", error);
      return null;
    }
  }, []);

  const playSentence = useCallback((audioBuffer: AudioBuffer): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioContextRef.current) return resolve();

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(console.error);
      }

      sourceNodeRef.current?.stop();
      sourceNodeRef.current?.disconnect();

      sourceNodeRef.current = audioContextRef.current.createBufferSource();
      sourceNodeRef.current.buffer = audioBuffer;
      sourceNodeRef.current.connect(audioContextRef.current.destination);
      sourceNodeRef.current.onended = () => resolve();
      sourceNodeRef.current.start();
    });
  }, []);

  const playNextSentence = useCallback(async (): Promise<void> => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    const audio = audioQueueRef.current.shift();
    if (audio) await playSentence(audio);
    playNextSentence();
  }, [playSentence]);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
  
    setIsLoading(true);
    const newMessages: CoreMessage[] = [...messages, { content: input, role: "user" }];
    setMessages(newMessages);
    setInput("");

    // Lấy user_id từ localStorage
    const userId = localStorage.getItem("user_id") || "default_user";
  
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: newMessages, userId }),
        headers: { "Content-Type": "application/json" },
      });
      const textResult = (await response.json()) as CoreMessage;
      setLastMessage(textResult);
      setMessages([...newMessages, textResult]);
      
      setIsLoading(false);
  
      if (typeof textResult.content === 'string') {
        const sentences = textResult.content.split(/(?<=\.|\?|!)/).map(s => s.trim()).filter(Boolean);
        
        (async () => {
          for (const sentence of sentences) {
            const audioBuffer = await synthesizeSentence(sentence);
            if (audioBuffer) {
              audioQueueRef.current.push(audioBuffer);
              if (!isPlayingRef.current && isAudioContextReady) {
                isPlayingRef.current = true;
                playNextSentence();
              }
            }
          }
        })();
      }
    } catch (error) {
      console.error("handleSubmit error:", error);
      alert("An error occurred while sending your message.");
      setIsLoading(false);
    }
  }, [messages, input, setMessages, setLastMessage, setIsLoading, synthesizeSentence, playNextSentence, isAudioContextReady]);

  return (
    <div className="absolute bottom-10 h-10 w-full max-w-lg px-5 z-50" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <form onSubmit={handleSubmit}>
        <div className={`flex w-full items-center overflow-hidden rounded-[12px] bg-white shadow transition-all duration-300 ${isHovered || input ? 'border-[rgb(196,191,228)] shadow-lg scale-105' : 'border-transparent'} border-2`}>
          <div className="flex h-full items-center justify-center px-4">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isProcessingAudio}
              aria-label={isRecording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}
              className={`p-1 rounded-full ${
                isRecording 
                  ? 'bg-red-100 animate-pulse' 
                  : isProcessingAudio 
                    ? 'bg-blue-100' 
                    : 'hover:bg-gray-100'
              }`}
            >
              {isProcessingAudio ? (
                <FaSpinner className="text-blue-500 animate-spin" />
              ) : isRecording ? (
                <FaMicrophoneSlash className="text-red-500" />
              ) : (
                <FaMicrophone className="text-gray-500 hover:text-gray-700" />
              )}
            </button>
          </div>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              className="h-full w-full px-2 py-2 text-neutral-800 outline-none"
              type="text"
              placeholder={
                isRecording 
                  ? "Đang ghi âm..." 
                  : isProcessingAudio 
                    ? "Đang xử lý âm thanh..." 
                    : "Nhập tin nhắn hoặc nhấn microphone để ghi âm..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSubmit(e as any)}
              disabled={isLoading || isRecording}
              aria-label="Chat input"
            />
          </div>
          <div className="flex h-full items-center justify-center px-4">
            <button type="submit" disabled={isLoading} aria-label="Send message">
              <IoSend className="text-blue-400 transition-colors hover:text-blue-500" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}