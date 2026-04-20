# iMessage visual reference (iOS 13 / iOS 14 — 2019–2020 era)

What we're matching and why each value was chosen. If you change these, change them everywhere (`MessageBubble.tsx`, `MessagePDF.tsx`, `tailwind.config.ts` / inline styles).

## Colors

| Role | Hex | Notes |
| --- | --- | --- |
| Sent bubble (iMessage blue) | `#007AFF` | Apple's system blue token (`UIColor.systemBlue`, light mode). iOS 14 Messages draws a subtle top-to-bottom gradient from ~`#1D9BF0` → `#007AFF`; flat is close enough at UI scale. |
| Sent bubble text | `#FFFFFF` | |
| Received bubble | `#E9E9EB` | iOS 14 light-mode received. iOS 13 was `#E5E5EA` — they're indistinguishable in practice. |
| Received bubble text | `#000000` | |
| Timestamps / meta | `#8E8E93` | `UIColor.systemGray` |
| Date separator | `#8E8E93` | Centered text, no pill background in iOS 14 (iOS 12 had a pill). |
| App background | `#FFFFFF` | Pure white in light mode. |

## Shape

- **Bubble radius:** `18px` on all four corners by default.
- **Tail:** the last message in a sender's run gets a `4px` radius on the corner nearest the sender (bottom-right for sent, bottom-left for received).
- **Horizontal padding:** `12px` (bubble); `8px` (text inside).
- **Vertical padding:** `6px`–`8px` per bubble.
- **Bubble-to-bubble gap within a run:** `2px`. Between runs: `10px`–`12px`.
- **Max bubble width:** ~75% of column.

## Typography

- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`. SF Pro on Apple devices, Segoe/Helvetica everywhere else; close enough for aesthetic parity.
- Message text: `15px` / `20px` line-height (SF Text at regular weight).
- Timestamps: `11px`, weight 600 for the sender/time label, weight 400 for just time.
- Sender name in group chats: `12px`, `#8E8E93`, above the first bubble of each sender's run only.

## Rules we enforce (and diverge from 2020 iMessage on)

- No "You" label above sent messages — iMessage never shows one.
- Sender name appears above the first bubble of a run, and **only in group chats**. In 1:1 chats, received bubbles are unlabeled.
- Date separator: centered light gray text, day of week + date, shown on first message of each new day.
- Reactions: floating "tapback" indicator sits at the top-right (or top-left for received) of the bubble and slightly overlaps it. Currently we render our own simplified indicator; close enough for now.
- Attachments (images, vCards, shared locations) render inline, rounded at `14px` to feel aligned with the bubble.

## Sources

- [Apple — iOS Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color) (system color tokens)
- [iMore — "Apple Messages" reference (iOS 14)](https://www.imore.com/messages) (visual walkthrough of iOS 14 Messages)
- [Apple support — Use Messages on your iPhone](https://support.apple.com/en-us/HT201287) (shows current bubble shapes/colors; layout has been stable since iOS 13)
- [Apple Community thread on iMessage bubble colors](https://discussions.apple.com/thread/251576525)

## Why not pull actual iOS 14 screenshots into the repo

Tried. Fetching random press screenshots is copyright-murky (Apple press assets are not open-licensed, and third-party sites rehost without provenance). The cleanest path is matching Apple's published system-color tokens and HIG rules — which is what we do. If you need literal screenshots for pixel-comparison during design work, screen-capture your own iPhone or drop them into `docs/reference/screenshots/` locally (that path is gitignored, see `.gitignore`).
