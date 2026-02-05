import React, { useState } from "react";
const PI_HOST = "rover.tail9d0237.ts.net";

export const CaptureButton = () => {
  const [isCapturing, setIsCapturing] = useState(false);

  const takePicture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(`http://${PI_HOST}:3000/api/camera/capture`, {
        method: "POST",
      });
      const data = await res.json();

      console.log(data);

      // Open the high-res photo in a new tab
      window.open(data.url, "_blank");
    } catch (err) {
      console.error("Capture trigger failed", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <button
      onClick={takePicture}
      disabled={isCapturing}
      className={`capture-btn-circle ${isCapturing ? "shutter-active" : ""}`}
      aria-label="Take Photo"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
        <path
          fillRule="evenodd"
          d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z"
        />
      </svg>
    </button>
  );
};
