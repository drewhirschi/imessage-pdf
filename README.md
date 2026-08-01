# iMessage PDF Exporter

A local macOS app for browsing iMessage history and exporting conversations as printable books. Messages and attachments stay on the computer; the Apple Messages database is opened read-only.

## Features

- Browse, search, and pin individual or group conversations
- Inspect available history by year and month
- Render images, videos, reactions, rich links, and attachments
- Filter long conversations to a date range
- Export an A5 print-ready PDF with optional QR codes for links
- Keep contact names and pinned conversations in a separate local app database

## Installation

The packaged app currently supports Apple Silicon Macs. Download the latest DMG from [GitHub Releases](https://github.com/drewhirschi/imessage-pdf/releases), open it, and drag **iMessage PDF Exporter** into Applications. Node.js is bundled in the app.

The app is currently unsigned. On first launch, right-click the app in Applications, choose **Open**, then choose **Open** again. If macOS still reports that the developer cannot be verified, go to **System Settings > Privacy & Security** and choose **Open Anyway**.

As a last-resort quarantine workaround for a release you downloaded from this repository:

```bash
xattr -dr com.apple.quarantine "/Applications/iMessage PDF Exporter.app"
```

Only run that command for a DMG you obtained from this project's release page and whose checksum matches `SHA256SUMS.txt`.

## Usage

### First Launch

The app checks the standard `~/Library/Messages` location automatically. macOS requires Full Disk Access for this folder, so the app will explain the permission and open the correct System Settings pane. Add **iMessage PDF Exporter**, enable it, then relaunch the app.

You can also point the app at a copied backup containing `chat.db` and an `Attachments` directory.

### PDF Features

- Clean, print-friendly layout
- iMessage-style message bubbles
- Timestamps and sender information
- Embedded images and link previews
- Proper page breaks and formatting
- Date separators for better organization
- Optional QR codes in the inner margin for printed links

The default page size is A5 (148 x 210 mm / 5.83 x 8.27 in). One tested physical-book configuration is Lulu with Color, 80# White Coated paper, Hardcover Case Wrap, and a Matte cover.

## Technical Details

### Built With

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **node:sqlite** - built-in SQLite database access (read-only)
- **Electron** - packaged macOS desktop shell and native PDF export
- **date-fns** - Date formatting

### Database Schema

The app reads from the standard iMessage SQLite database with these key tables:

- `chat` - Conversation metadata
- `message` - Individual messages
- `handle` - Contact information
- `attachment` - File attachments
- Various join tables for relationships

## Security Notes

- The app runs locally and only accesses your local files
- No data is sent to external servers
- Database access is read-only
- Paths are stored in browser localStorage

## Troubleshooting

### Common Issues

1. **"Database not found"**: Confirm Messages has downloaded locally or select a copied backup
2. **"No conversations found"**: Check that the database file is accessible and not corrupted
3. **"Attachments not loading"**: Verify the attachments folder path is correct
4. **Permission errors**: Add the app under Full Disk Access, then quit and reopen it

### File Permissions

For the packaged app, grant **iMessage PDF Exporter** permission:

1. Open System Settings > Privacy & Security > Full Disk Access
2. Add iMessage PDF Exporter from Applications
3. Enable it, then quit and reopen the app

## Development

Requires Node 24 and pnpm 10.

```bash
pnpm install
pnpm dev             # browser development at localhost:3000
pnpm electron:dev    # prepare and launch the Electron shell
pnpm test
pnpm electron:build  # unsigned Apple Silicon DMG, including Node 24
```

`electron:dev` rebuilds the standalone Next server before launching Electron. Renderer hot reload remains available through `pnpm dev`; the packaged-server development command requires a restart after code changes.

### Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── conversation/      # Conversation pages
│   └── layout.tsx         # Root layout
├── components/            # React components
├── lib/                   # Utilities and database code
│   ├── db/               # Database connection and queries
│   └── pdf/              # PDF generation
└── public/               # Static assets
```

### API Endpoints

- `GET /api/conversations` - List all conversations
- `GET /api/messages` - Get messages for a conversation
- `GET /api/attachments/[id]` - Serve attachment files
- `POST /api/generate-pdf` - Generate PDF from conversation

## License

This project is for personal use. Please respect Apple's terms of service and privacy policies when using this tool.

Release verification is tracked in [docs/release-checklist.md](docs/release-checklist.md).

## Disclaimer

This tool is not affiliated with Apple Inc. Use at your own risk. Always backup your data before using third-party tools with your personal information.
