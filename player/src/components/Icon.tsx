type IconProps = {
  name: string;
  size?: number;
  stroke?: number;
};

export const Icon = ({ name, size = 16, stroke = 1.6 }: IconProps) => {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size, height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    viewBox: '0 0 24 24',
  };
  const filled = { ...s, fill: 'currentColor', stroke: 'none' };

  switch (name) {
    case 'lock':   return <svg {...s}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case 'play':   return <svg {...filled}><path d="M7 5l12 7-12 7z"/></svg>;
    case 'pause':  return <svg {...filled}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case 'search': return <svg {...s}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'arrow':  return <svg {...s}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'back':   return <svg {...s}><path d="M19 12H5M11 18l-6-6 6-6"/></svg>;
    case 'plus':   return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check':  return <svg {...s}><path d="m5 12 5 5L20 7"/></svg>;
    case 'volume': return <svg {...s}><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9c1 1 1.5 2 1.5 3s-.5 2-1.5 3M19 6c2 2 3 4 3 6s-1 4-3 6"/></svg>;
    case 'mute':   return <svg {...s}><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>;
    case 'cog':    return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'cap':    return <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M13 15h4M7 11h2M11 11h6"/></svg>;
    case 'expand': return <svg {...s}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>;
    case 'skip':   return <svg {...s}><path d="M12 5a7 7 0 1 0 7 7"/><path d="M12 2v4l3-2z" style={{fill:'currentColor'}}/></svg>;
    case 'chev':   return <svg {...s}><path d="m9 6 6 6-6 6"/></svg>;
    case 'shield': return <svg {...s}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>;
    case 'wave':   return <svg {...s}><path d="M3 12h2l2-7 4 14 3-10 2 7 2-4h3"/></svg>;
    case 'info':   return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></svg>;
    case 'film':   return <svg {...s}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/></svg>;
    case 'list':   return <svg {...s}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case 'dot':    return <svg {...filled}><circle cx="12" cy="12" r="3"/></svg>;
    case 'bell':   return <svg {...s}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>;
    default:       return null;
  }
};
