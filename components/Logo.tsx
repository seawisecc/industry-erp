export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 4h6v6.5l5.5 12c1 2.2-.6 4.5-3 4.5H10.5c-2.4 0-4-2.3-3-4.5l5.5-12V4z"
        stroke="#FAF7F1"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.5 5.5h9" stroke="#FAF7F1" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M19 7c2.2-1.6 4.6-1 5.6.6.9 1.5.3 3.6-1.6 4.4-2.2.9-4.6-.6-5-2.4"
        stroke="#C1623D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 19h10l1.3 2.9c.5 1.1-.3 2.3-1.5 2.3H11.2c-1.2 0-2-1.2-1.5-2.3L11 19z"
        fill="#2F4D3A"
        opacity="0.85"
      />
    </svg>
  );
}