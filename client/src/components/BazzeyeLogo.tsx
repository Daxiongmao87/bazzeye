
import React from 'react';

export const BazzeyeLogo: React.FC<{ size?: number, className?: string }> = ({ size = 32, className = "" }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Eye Shape */}
            <path
                d="M50 20C30 20 10 50 10 50C10 50 30 80 50 80C70 80 90 50 90 50C90 50 70 20 50 20Z"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Iris (Circle) */}
            <circle cx="50" cy="50" r="18" fill="currentColor" className="text-blue-500" fillOpacity="0.2" stroke="currentColor" strokeWidth="3" />

            {/* D-Pad */}
            <g fill="currentColor" transform="translate(50, 50)">
                {/* Cross shape centered at 0,0 */}
                <rect x="-4" y="-10" width="8" height="20" rx="1" />
                <rect x="-10" y="-4" width="20" height="8" rx="1" />
            </g>
        </svg>
    );
};
