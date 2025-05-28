// src/components/icons/AdpopcornLogoIcon.tsx
import type { SVGProps } from 'react';

export function AdpopcornLogoIcon(props: SVGProps<SVGSVGElement>) {
  // This SVG is a placeholder representation based on the provided image.
  // For best results, use the actual SVG code if available.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 190 38" // Adjusted viewBox for better fitting text and icon
      fill="none"
      // width and height will be applied from where it's used (e.g., 150x24)
      // Defaulting here if used without props, but will be overridden
      // For a target of 150x24, the viewBox height (38) would scale down to 24,
      // and width (190) would scale to 190 * (24/38) = ~119.
      // To achieve 150 width and 24 height, the parent should set these.
      // The viewBox aspect ratio is 190/38 = 5.
      // If height is 24, width would be 24*5 = 120.
      // If width is 150, height would be 150/5 = 30.
      // Let's adjust viewBox to better match 150x24 ratio (150/24 = 6.25)
      // viewBox="0 0 150 24" - this means 1:1 scaling if width/height props match.
      // Let's use viewBox="0 0 150 24" and ensure content fits.
      // Icon part approx 20-24px high. Text part next to it.
      // Icon: 0-24 width, 0-24 height.
      // Text: ADPOPCORN (y=9, font-size 8), reward_cs (y=19, font-size 6)
      // <svg viewBox="0 0 150 24" ... > // This matches the target dimensions well.
      {...props} // width & height from props will determine final size.
    >
      {/* Blue 'A'-like/folded ribbon logo icon */}
      <g transform="translate(0, 0.5) scale(0.9)">
        <path 
          d="M7.6518 17.8264L13.0068 8.51135L18.3618 17.8264H15.1398L13.0068 11.9054L10.8738 17.8264H7.6518Z" 
          fill="#0D6EFD"/> 
        <path 
          d="M13.0068 11.9052L7.65186 17.8262L4 17.8262L13.0068 2.99976L22.0138 17.8262L18.3618 17.8262L13.0068 8.51123V11.9052Z" 
          fill="#0D6EFD"/>
        <path 
          d="M13.0066 11.9052L18.3616 17.8262H15.1396L13.0066 11.9052Z" 
          fill="#0A58CA"/>
      </g>
      
      {/* ADPOPCORN text */}
      <text
        x="30" 
        y="10.5" 
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
        fontSize="9.5"
        fontWeight="bold"
        fill="currentColor" 
      >
        ADPOPCORN
      </text>
      
      {/* reward_cs text */}
      <text
        x="30"
        y="20.5"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
        fontSize="7.5"
        fill="currentColor"
        opacity="0.85"
      >
        reward_cs
      </text>
    </svg>
  );
}
