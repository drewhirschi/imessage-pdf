import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import {
  getMessagesForConversation,
  getConversationById,
} from "@/lib/db/queries";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      chatId,
      dbPath,
      attachmentsPath,
      startDate,
      endDate,
      title = "iMessage Conversation",
    } = body;

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

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 612; // 8.5 inches
    const pageHeight = 792; // 11 inches
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let currentY = pageHeight - margin - 50;

    // Add title
    currentPage.drawText(title, {
      x: margin,
      y: currentY,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 30;

    // Add conversation info
    const conversationInfo = `Participants: ${conversation.chat_identifier}`;
    currentPage.drawText(conversationInfo, {
      x: margin,
      y: currentY,
      size: 12,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    currentY -= 20;

    // Add date range if specified
    if (startDate || endDate) {
      const start = startDate
        ? new Date(parseInt(startDate) * 1000).toLocaleDateString()
        : "Beginning";
      const end = endDate
        ? new Date(parseInt(endDate) * 1000).toLocaleDateString()
        : "Present";
      const dateRange = `Date Range: ${start} - ${end}`;
      currentPage.drawText(dateRange, {
        x: margin,
        y: currentY,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
      });
      currentY -= 30;
    }

    // Add messages
    for (const messageData of messages) {
      const { message, handle, attachments } = messageData;

      // Check if we need a new page
      if (currentY < 100) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }

      // Format timestamp
      const timestamp = new Date(message.date * 1000).toLocaleString();
      const sender = message.is_from_me ? "You" : handle?.id || "Unknown";

      // Draw sender and timestamp
      currentPage.drawText(`${sender} - ${timestamp}`, {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
      currentY -= 15;

      // Draw message text if present
      if (message.text && message.text.trim()) {
        const text = message.text;
        const maxWidth = contentWidth - 20;
        const bubbleWidth = Math.min(maxWidth, text.length * 6 + 20);
        const bubbleX = message.is_from_me
          ? pageWidth - margin - bubbleWidth
          : margin;

        // Draw message bubble background
        currentPage.drawRectangle({
          x: bubbleX,
          y: currentY - 20,
          width: bubbleWidth,
          height: 25,
          borderColor: message.is_from_me ? rgb(0, 0.5, 1) : rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
          color: message.is_from_me ? rgb(0, 0.5, 1) : rgb(0.9, 0.9, 0.9),
        });

        // Draw message text
        currentPage.drawText(text, {
          x: bubbleX + 10,
          y: currentY - 10,
          size: 11,
          font: font,
          color: message.is_from_me ? rgb(1, 1, 1) : rgb(0, 0, 0),
          maxWidth: bubbleWidth - 20,
        });

        currentY -= 35;
      }

      // Handle attachments
      for (const attachment of attachments) {
        if (attachment.filename && attachmentsPath) {
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

          if (fs.existsSync(attachmentPath)) {
            const ext = path.extname(attachment.filename).toLowerCase();

            if (
              [
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
              // For images, we'll just note their presence in the PDF
              // In a full implementation, you'd embed the actual image
              currentPage.drawText(`[Image: ${attachment.filename}]`, {
                x: margin,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0.3, 0.3, 0.3),
              });
              currentY -= 15;
            } else {
              currentPage.drawText(`[Attachment: ${attachment.filename}]`, {
                x: margin,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0.3, 0.3, 0.3),
              });
              currentY -= 15;
            }
          }
        }
      }

      currentY -= 10; // Space between messages
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Return PDF as response
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="imessage-${chatId}-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
