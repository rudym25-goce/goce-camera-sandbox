export const COLORS = {
  primary: {
    hex: '#ff8c00',
    number: 0xff8c00,
  },
  success: {
    hex: '#00ff00',
    number: 0x00ff00,
  },
  global: {
    hex: '#e8a611',
    number: 0xe8a611
  },
  alternative: {
    hex: '#15B5B0',
    number: 0x15b5b0
  }
};

// Helper function to convert between formats
export const colorToHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
export const hexToColor = (hex: string): number => parseInt(hex.replace('#', ''), 16);
