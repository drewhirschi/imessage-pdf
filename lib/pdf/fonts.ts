import { Font } from '@react-pdf/renderer';
import path from 'path';

// Register SF Pro Text fonts
Font.register({
  family: 'SF Pro Text',
  fonts: [
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-Regular.otf'),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-RegularItalic.otf'),
      fontWeight: 400,
      fontStyle: 'italic',
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-Medium.otf'),
      fontWeight: 500,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-MediumItalic.otf'),
      fontWeight: 500,
      fontStyle: 'italic',
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-Semibold.otf'),
      fontWeight: 600,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-SemiboldItalic.otf'),
      fontWeight: 600,
      fontStyle: 'italic',
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-Bold.otf'),
      fontWeight: 700,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Text-BoldItalic.otf'),
      fontWeight: 700,
      fontStyle: 'italic',
    },
  ],
});

// Register SF Pro Display fonts (for titles/headers)
Font.register({
  family: 'SF Pro Display',
  fonts: [
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Display-Regular.otf'),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Display-Medium.otf'),
      fontWeight: 500,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Display-Semibold.otf'),
      fontWeight: 600,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/SF-Pro-Display-Bold.otf'),
      fontWeight: 700,
    },
  ],
});

export const FONT_FAMILIES = {
  text: 'SF Pro Text',
  display: 'SF Pro Display',
} as const;


