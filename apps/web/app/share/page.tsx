"use client";

import { LanQrCodeShare } from "@/components/mobile/LanQrCodeShare";

export default function SharePage() {
  return (
    <div className="share-page">
      <div className="share-container">
        <h1>Share WebXR Session</h1>
        <p className="description">Scan the QR code on a Quest headset to open the 360 video editor.</p>
        <LanQrCodeShare />
      </div>
      <style jsx>{`
        .share-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 2rem;
        }
        .share-container {
          background: white;
          border-radius: 1rem;
          padding: 3rem;
          max-width: 500px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
          color: #1f2937;
        }
        .description {
          color: #6b7280;
          margin-bottom: 2rem;
          font-size: 1.1rem;
        }
        :global(.lan-qr-share) {
          margin-top: 2rem;
        }
        :global(.lan-qr-share h3) {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          color: #374151;
        }
        :global(.lan-qr-share .qr-card) {
          background: #f9fafb;
          padding: 1.5rem;
          border-radius: 0.5rem;
          margin: 1.5rem auto;
          display: inline-block;
        }
        :global(.lan-qr-share .qr-card img) {
          display: block;
          max-width: 280px;
          height: auto;
        }
        :global(.lan-qr-share .url-text) {
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin: 1rem 0;
          word-break: break-all;
          color: #1f2937;
          font-size: 0.9rem;
        }
        :global(.lan-qr-share .hint) {
          color: #9ca3af;
          font-size: 0.9rem;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
