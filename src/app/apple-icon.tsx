import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #090D1A 0%, #0D1527 100%)",
          borderRadius: "40px",
        }}
      >
        <svg
          width="116"
          height="116"
          viewBox="0 0 24 24"
          fill="#3C07FF"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.63 4.702 17.96 0 9.086 2.484c-.463 1.754-.694 4.139.133 6.655.232-.067.463-.1.695-.133a4.724 4.724 0 0 1 5.133 4.305 4.724 4.724 0 0 1-4.305 5.133 4.724 4.724 0 0 1-5.132-4.305 4.618 4.618 0 0 1 1.159-3.543c-.86-1.325-1.987-3.609-1.954-6.49C1.107 6.623-.847 11.258.378 15.86c1.49 5.828 7.45 9.305 13.245 7.782 4.603-1.192 7.748-5.198 8.113-9.702l2.251-1.622-6.358-7.616Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
