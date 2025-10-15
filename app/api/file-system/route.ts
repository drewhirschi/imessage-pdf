import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, resolve, dirname } from "path";
import { homedir } from "os";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get("path");

    if (!requestedPath) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    // Expand home directory if path starts with ~
    let resolvedPath = requestedPath;
    if (requestedPath.startsWith("~")) {
      resolvedPath = join(homedir(), requestedPath.slice(1));
    }

    // Resolve to absolute path
    resolvedPath = resolve(resolvedPath);

    // Verify the path exists and is accessible
    try {
      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: "Path is not a directory" },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: "Path does not exist or is not accessible" },
        { status: 404 }
      );
    }

    // Read directory contents
    const entries = await readdir(resolvedPath, { withFileTypes: true });

    // Filter out hidden files and convert to our format
    const items = entries
      .filter((entry) => !entry.name.startsWith(".")) // Filter out hidden files
      .map((entry) => ({
        name: entry.name,
        path: join(resolvedPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }))
      .sort((a, b) => {
        // Sort directories first, then files, both alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({
      currentPath: resolvedPath,
      items,
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    return NextResponse.json(
      { error: "Failed to read directory" },
      { status: 500 }
    );
  }
}
