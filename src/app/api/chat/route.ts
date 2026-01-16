import { type CoreMessage } from "~/types/chat";

export const maxDuration = 30;

const AMI_API_URL = process.env.API_URL;

export async function POST(req: Request) {
  const { messages, username = "bạn", userId = "default_user" } = await req.json() as {
    messages: CoreMessage[],
    username?: string,
    userId?: string
  };

  // Lọc bỏ messages rỗng hoặc không hợp lệ
  const validMessages = messages.filter(msg =>
    msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0
  );

  console.info("Generating text with valid messages", validMessages);

  // Kiểm tra có message hợp lệ không
  if (validMessages.length === 0) {
    return new Response(JSON.stringify({
      role: "assistant",
      content: `Chào ${username}! Em không nhận được tin nhắn gì từ anh. Anh có thể nói gì đó không?`,
    } as CoreMessage), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lấy tin nhắn cuối cùng của user
  const userMessages = validMessages.filter(msg => msg.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1];

  if (!latestUserMessage) {
    return new Response(JSON.stringify({
      role: "assistant",
      content: `Chào ${username}! Anh có thể nói gì đó không?`,
    } as CoreMessage), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!AMI_API_URL) {
      throw new Error("AMI_API_URL is not defined");
    }

    // Gửi request đến Ami API
    const response = await fetch(AMI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: latestUserMessage.content,
        user_id: userId,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as { response?: string; message?: string };
    const text = data.response || data.message || "";

    return new Response(JSON.stringify({
      role: "assistant",
      content: text,
    } as CoreMessage), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Ami API error:", error);

    // Fallback response khi API lỗi
    const fallbackMessage = `Xin lỗi ${username}, em đang gặp chút vấn đề kỹ thuật. Em sẽ cố gắng trả lời sau nhé. Anh có thể thử lại sau một chút không?`;

    return new Response(JSON.stringify({
      role: "assistant",
      content: fallbackMessage,
    } as CoreMessage), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}