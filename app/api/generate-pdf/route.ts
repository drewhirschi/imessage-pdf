import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import {
  getMessagesForConversation,
  getConversationById,
} from "@/lib/db/queries";
import { renderToStream } from "@react-pdf/renderer";
import MessagePDF from "@/lib/pdf/MessagePDF";
import { getResolver } from "@/lib/contacts/store";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import convert from "heic-convert";

interface ProcessedAttachment {
  ROWID: number;
  filename: string | null;
  mime_type: string | null;
  imageData?: string;
}

async function processAttachment(
  attachment: any,
  attachmentsPath: string
): Promise<ProcessedAttachment> {
  const processed: ProcessedAttachment = {
    ROWID: attachment.ROWID,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
  };

  if (!attachment.filename || !attachmentsPath) {
    return processed;
  }

  try {
    // Strip the ~/Library/Messages/ prefix from filename if present
    let relativeFilename = attachment.filename;
    if (attachment.filename.startsWith("~/Library/Messages/")) {
      relativeFilename = attachment.filename.substring(
        "~/Library/Messages/".length
      );
    } else if (attachment.filename.startsWith("/Library/Messages/")) {
      relativeFilename = attachment.filename.substring(
        "/Library/Messages/".length
      );
    }

    const attachmentPath = path.join(attachmentsPath, relativeFilename);

    if (!fs.existsSync(attachmentPath)) {
      console.warn(`Attachment not found: ${attachmentPath}`);
      return processed;
    }

    const ext = path.extname(attachment.filename).toLowerCase();

    // Only process image attachments
    if (
      ![
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".heic",
        ".heif",
        ".pluginpayloadattachment",
      ].includes(ext)
    ) {
      return processed;
    }

    let imageBuffer: Buffer;

    // Convert HEIC/HEIF to JPEG
    if (ext === ".heic" || ext === ".heif") {
      const inputBuffer = fs.readFileSync(attachmentPath);
      const outputBuffer = await convert({
        buffer: inputBuffer as any,
        format: "JPEG",
        quality: 0.9,
      });
      imageBuffer = Buffer.from(outputBuffer);
    } else {
      imageBuffer = fs.readFileSync(attachmentPath);
    }

    // Resize image to reasonable dimensions for PDF
    // Max width 800px, max height 1000px, maintain aspect ratio
    const resizedBuffer = await sharp(imageBuffer)
      .resize(800, 1000, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Convert to base64 data URL
    const base64 = resizedBuffer.toString("base64");
    processed.imageData = `data:image/jpeg;base64,${base64}`;
    processed.mime_type = "image/jpeg";
  } catch (error) {
    console.error(`Error processing attachment ${attachment.filename}:`, error);
  }

  return processed;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      chatId,
      dbPath,
      attachmentsPath,
      contactsPath,
      startDate,
      endDate,
      title = "iMessage Conversation",
    } = body;

    const resolver = getResolver(contactsPath);
    const resolveName = (id: string | null | undefined) => {
      if (!id) return null;
      return resolver.resolve(id);
    };

    if (!chatId || !dbPath) {
      return NextResponse.json(
        { error: "Chat ID and database path are required" },
        { status: 400 }
      );
    }

    // Connect to the database
    connectToDatabase(dbPath);

    // Get conversation info
    const conversation = getConversationById(parseInt(chatId));
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get messages (get all without pagination for PDF)
    const result = getMessagesForConversation(
      parseInt(chatId),
      startDate ? parseInt(startDate) : undefined,
      endDate ? parseInt(endDate) : undefined
    );
    const messages = result.messages;

    // Process all attachments
    console.log("Processing attachments...");
    const processedMessages = await Promise.all(
      messages.map(async (messageData) => {
        const processedAttachments = await Promise.all(
          messageData.attachments.map((attachment) =>
            processAttachment(attachment, attachmentsPath)
          )
        );

        return {
          ...messageData,
          attachments: processedAttachments,
        };
      })
    );

    // Get participants list with resolved names
    const participants = [
      ...new Set(
        messages
          .map((m) => {
            if (m.message.is_from_me) return "You";
            const id = m.handle?.id;
            if (!id) return null;
            return resolveName(id) ?? id;
          })
          .filter((v): v is string => !!v)
      ),
    ];

    console.log("Generating PDF...");

    // Create PDF using React PDF renderer with streaming
    const stream = await renderToStream(
      MessagePDF({
        title,
        participants,
        messages: processedMessages,
        startDate: startDate ? parseInt(startDate) : undefined,
        endDate: endDate ? parseInt(endDate) : undefined,
        nameMap: resolver.nameMap,
      })
    );

    console.log("PDF stream created, sending to client...");

    // Convert Node.js stream to Web Stream for NextResponse
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        
        stream.on("end", () => {
          console.log("PDF stream completed");
          controller.close();
        });
        
        stream.on("error", (error: Error) => {
          console.error("Stream error:", error);
          controller.error(error);
        });
      },
    });

    // Return streamed PDF response
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="imessage-${chatId}-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(error) },
      { status: 500 }
    );
  }
}
