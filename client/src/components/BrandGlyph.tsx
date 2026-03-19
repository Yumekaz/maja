import React from 'react';

interface BrandGlyphProps {
  className?: string;
  framed?: boolean;
  title?: string;
}

function BrandGlyph({
  className = '',
  framed = true,
  title,
}: BrandGlyphProps): JSX.Element {
  const modeClass = framed ? 'brand-glyph--framed' : 'brand-glyph--compact';
  const classes = `brand-glyph ${modeClass} ${className}`.trim();

  return (
    <svg
      viewBox="0 0 48 48"
      className={classes}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {framed && <rect x="4" y="4" width="40" height="40" rx="14" className="brand-glyph__frame" />}
      <path
        d="M14 30L22 20L31 26L36 16"
        className="brand-glyph__link"
      />
      <circle cx="14" cy="30" r="3.8" className="brand-glyph__node brand-glyph__node--primary" />
      <circle cx="22" cy="20" r="3.8" className="brand-glyph__node brand-glyph__node--muted" />
      <circle cx="31" cy="26" r="3.8" className="brand-glyph__node brand-glyph__node--primary" />
      <circle cx="36" cy="16" r="3.8" className="brand-glyph__node brand-glyph__node--warm" />
    </svg>
  );
}

export default BrandGlyph;
