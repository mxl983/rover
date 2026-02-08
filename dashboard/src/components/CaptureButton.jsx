import React, { useState } from "react";
import { PI_HI_RES_CAPTURE_ENDPOINT } from "../constants";

export const CaptureButton = () => {
  const [isCapturing, setIsCapturing] = useState(false);

  const takePicture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(PI_HI_RES_CAPTURE_ENDPOINT, {
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
      ype="button"
      title="Take a 4k picture!!"
      onClick={takePicture}
      disabled={isCapturing}
      className={`capture-btn-circle ${isCapturing ? "shutter-active" : ""}`}
      aria-label="Take Photo"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <circle cx="12" cy="13" r="3.25" />
        <path
          fillRule="evenodd"
          d="M7.5 4.5a1 1 0 011-.8h7a1 1 0 011 .8L17.5 7h2.25A2.25 2.25 0 0122 9.25v9.5A2.25 2.25 0 0119.75 21H4.25A2.25 2.25 0 012 18.75v-9.5A2.25 2.25 0 014.25 7h2.25l1-2.5zM12 8.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
};
