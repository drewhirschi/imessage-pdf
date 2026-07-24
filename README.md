# iMessage PDF Exporter

A Next.js application that allows you to export your iMessage conversations to beautiful, printable PDFs.

## Features

- 📱 View all your iMessage conversations
- 📅 Filter messages by date range
- 🖼️ Display images and attachments inline
- 📄 Generate printable PDFs with iMessage-style formatting
- 👥 Support for both individual and group conversations
- 🎨 Clean, modern interface

## Prerequisites

- Node.js 18+
- Access to your iMessage database (macOS)
- iMessage database file (`chat.db`)
- iMessage attachments folder

## Installation

1. Clone or download this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Finding Your iMessage Data

On macOS, your iMessage data is typically located at:

- **Database**: `~/Library/Messages/chat.db`
- **Attachments**: `~/Library/Messages/Attachments/`

### Using the App

1. **Configure Paths**:
   - Enter the paths to your iMessage database and attachments folder manually, OR
   - Use the "Browse" button to select files (note: due to browser security restrictions, you may need to manually enter the full path)
   - Use the quick-fill buttons for common macOS paths
2. **Browse Conversations**: View all your available conversations
3. **Select a Conversation**: Click on any conversation to view its messages
4. **Filter by Date**: Use the date range picker to filter messages
5. **Generate PDF**: Click "Generate PDF" to download a printable version

### PDF Features

- Clean, print-friendly layout
- iMessage-style message bubbles
- Timestamps and sender information
- Image placeholders (images are referenced but not embedded)
- Proper page breaks and formatting
- Date separators for better organization

## Technical Details

### Built With

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **node:sqlite** - built-in SQLite database access (read-only)
- **pdf-lib** - PDF generation
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

1. **"Database not found"**: Ensure the path to `chat.db` is correct
2. **"No conversations found"**: Check that the database file is accessible and not corrupted
3. **"Attachments not loading"**: Verify the attachments folder path is correct
4. **Permission errors**: Make sure the app has read access to the iMessage files

### File Permissions

On macOS, you may need to grant Terminal (or your code editor) permission to access your Messages folder:

1. Go to System Preferences > Security & Privacy > Privacy
2. Select "Full Disk Access" or "Files and Folders"
3. Add your terminal application

## Development

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

## Disclaimer

This tool is not affiliated with Apple Inc. Use at your own risk. Always backup your data before using third-party tools with your personal information.
