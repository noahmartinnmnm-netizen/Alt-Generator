import { useEffect } from "react";

const TAWK_PROPERTY_ID = "6a46a7e8c5bc5d1d49179652";
const TAWK_WIDGET_ID = "1jshvvpgm";

export function TawkChat() {
  useEffect(() => {
    if (typeof window === "undefined" || document.getElementById("tawk-script")) {
      return;
    }

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    window.Tawk_API.customStyle = {
      visibility: {
        desktop: {
          position: "br",
          xOffset: "20px",
          yOffset: "20px",
        },
        mobile: {
          position: "br",
          xOffset: "10px",
          yOffset: "10px",
        },
      },
    };

    const script = document.createElement("script");
    script.id = "tawk-script";
    script.async = true;
    script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");

    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }, []);

  return null;
}
