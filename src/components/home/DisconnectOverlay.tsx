"use client";

type DisconnectOverlayProps = {
  message: string;
};

export function DisconnectOverlay({ message }: DisconnectOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
      role="alert"
      aria-live="assertive"
    >
      <p className="max-w-lg text-center text-3xl font-bold text-white md:text-4xl">
        {message}
      </p>
    </div>
  );
}
