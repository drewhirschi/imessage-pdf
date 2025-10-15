import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connection";
import { getAttachmentPath } from "@/lib/db/queries";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

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

    // Check if it's a video file
    const ext = path.extname(filename).toLowerCase();
    const videoExtensions = [".mov", ".mp4", ".avi", ".webm", ".m4v", ".mkv"];

    if (!videoExtensions.includes(ext)) {
      return NextResponse.json({ error: "Not a video file" }, { status: 400 });
    }

    // Generate thumbnail using ffmpeg
    return new Promise<NextResponse>((resolve) => {
      const tempDir = path.join(process.cwd(), "tmp");

      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilename = `thumb_${resolvedParams.id}_${Date.now()}.png`;
      const tempPath = path.join(tempDir, tempFilename);

      ffmpeg(fullPath)
        .screenshots({
          timestamps: ["1"], // Take screenshot at 1 second
          count: 1,
          filename: tempFilename,
          folder: tempDir,
          size: "400x?", // Max width 400px, maintain aspect ratio
        })
        .on("end", async () => {
          try {
            // Read the generated thumbnail
            const thumbnailBuffer = fs.readFileSync(tempPath);

            // Resize and optimize with sharp
            const optimizedBuffer = await sharp(thumbnailBuffer)
              .resize(400, 400, { fit: "inside", withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();

            // Clean up temp file
            try {
              fs.unlinkSync(tempPath);
            } catch (cleanupError) {
              console.error("Error cleaning up temp file:", cleanupError);
            }

            resolve(
              new NextResponse(new Uint8Array(optimizedBuffer), {
                headers: {
                  "Content-Type": "image/jpeg",
                  "Cache-Control": "public, max-age=31536000, immutable",
                },
              })
            );
          } catch (error) {
            console.error("Error processing thumbnail:", error);
            // Clean up temp file if it exists
            try {
              if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
              }
            } catch (cleanupError) {
              console.error("Error cleaning up temp file:", cleanupError);
            }

            resolve(
              NextResponse.json(
                { error: "Failed to process thumbnail" },
                { status: 500 }
              )
            );
          }
        })
        .on("error", (err) => {
          console.error("Error generating thumbnail:", err);
          // Clean up temp file if it exists
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (cleanupError) {
            console.error("Error cleaning up temp file:", cleanupError);
          }

          resolve(
            NextResponse.json(
              { error: "Failed to generate thumbnail" },
              { status: 500 }
            )
          );
        });
    });
  } catch (error) {
    console.error("Error serving thumbnail:", error);
    return NextResponse.json(
      { error: "Failed to serve thumbnail" },
      { status: 500 }
    );
  }
}
