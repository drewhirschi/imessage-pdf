import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import { getAttachmentPath } from "@/lib/db/queries";
import fs from "fs";
import path from "path";
import convert from "heic-convert";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const dbPath = searchParams.get("dbPath");
    const attachmentsPath = searchParams.get("attachmentsPath");

    if (!dbPath || !attachmentsPath) {
      return NextResponse.json(
        { error: "Database path and attachments path are required" },
        { status: 400 }
      );
    }

    // Connect to the database
    connectToDatabase(dbPath);

    // Get attachment filename
    const resolvedParams = await params;
    const filename = getAttachmentPath(parseInt(resolvedParams.id));

    if (!filename) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Strip the ~/Library/Messages/ prefix from filename if present
    // The database stores full macOS paths, but we need to use the custom attachmentsPath
    let relativeFilename = filename;
    if (filename.startsWith("~/Library/Messages/")) {
      relativeFilename = filename.substring(
        "~/Library/Messages/Attachments/".length
      );
    } else if (filename.startsWith("/Library/Messages/")) {
      relativeFilename = filename.substring(
        "/Library/Messages/Attachments/".length
      );
    }

    // Construct full path to attachment
    const fullPath = path.join(attachmentsPath, relativeFilename);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json(
        { error: "Attachment file not found" },
        { status: 404 }
      );
    }

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    let fileBuffer: Buffer;

    // Convert HEIC/HEIF images to JPEG
    if (ext === ".heic" || ext === ".heif") {
      try {
        const inputBuffer = fs.readFileSync(fullPath);
        const outputBuffer = await convert({
          buffer: inputBuffer as any, // Type assertion: heic-convert accepts Buffer despite types
          format: "JPEG",
          quality: 0.9,
        });
        fileBuffer = Buffer.from(outputBuffer);
        contentType = "image/jpeg";
      } catch (error) {
        console.error("Error converting HEIC to JPEG:", error);
        return NextResponse.json(
          { error: "Failed to convert HEIC image" },
          { status: 500 }
        );
      }
    } else {
      fileBuffer = fs.readFileSync(fullPath);
      switch (ext) {
        case ".jpg":
        case ".jpeg":
          contentType = "image/jpeg";
          break;
        case ".png":
        case ".pluginpayloadattachment":
          contentType = "image/png";
          break;
        case ".gif":
          contentType = "image/gif";
          break;
        case ".webp":
          contentType = "image/webp";
          break;
        case ".mp4":
        case ".m4v":
          contentType = "video/mp4";
          break;
        case ".mov":
          contentType = "video/quicktime";
          break;
        case ".avi":
          contentType = "video/x-msvideo";
          break;
        case ".webm":
          contentType = "video/webm";
          break;
        case ".mkv":
          contentType = "video/x-matroska";
          break;
        case ".pdf":
          contentType = "application/pdf";
          break;
      }
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json(
      { error: "Failed to serve attachment" },
      { status: 500 }
    );
  }
}
